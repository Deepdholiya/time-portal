// Reimbursements: people claim back expenses they paid on the company's behalf; approvers (or the project's manager) review them.
import { Router, type Request } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, audit, notify } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { accessibleProjectIds, atLeast, getPermissions } from "../permissions.js";
import { DATE } from "../scope.js";
import { today } from "../weeks.js";

export const reimbursementsRouter = Router();

export const CATEGORIES = ["TRAVEL", "MEALS", "SUPPLIES", "SOFTWARE", "OTHER"] as const;
const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

const include = {
  user: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, color: true, managerId: true } },
  reviewer: { select: { id: true, name: true } },
} satisfies Prisma.ReimbursementInclude;

const bodySchema = z.object({
  date: DATE,
  amount: z.number().positive("The amount must be more than zero").max(10_000_000, "That amount is too large"),
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(1, "Describe the expense").max(500, "Keep the description under 500 characters"),
  projectId: z.number().int().nullish(),
  receiptUrl: z.string().trim().max(1000).url("The receipt link must be a full URL").nullish().or(z.literal("")),
});

const tomorrow = () => { const d = new Date(today() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

async function checkBody(req: Request, d: { date: string; projectId?: number | null }) {
  if (d.date > tomorrow()) throw new HttpError(400, "The expense date can't be in the future");
  if (d.projectId) {
    const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
    const p = await prisma.project.findFirst({ where: { id: d.projectId, companyId: cid(req) }, select: { id: true } });
    if (!p || (ids !== "all" && !ids.includes(p.id))) throw new HttpError(400, "Pick a project you work on");
  }
}

/** Company members allowed to approve reimbursements, for notifications. */
async function approverIds(companyId: number, except: number) {
  const members = await prisma.membership.findMany({ where: { companyId, userId: { not: except }, user: { status: "ACTIVE" } }, select: { user: { select: { id: true, role: true } } } });
  const out: number[] = [];
  for (const m of members) if (atLeast(await getPermissions(companyId, m.user), "expenseApprove", "yes")) out.push(m.user.id);
  return out;
}

const approver = (req: Request) => can(req, "expenseApprove", "yes");
/** Approvers review anyone's request; a project's manager reviews requests tied to that project. */
const canReview = (req: Request, r: { userId: number; project: { managerId: number | null } | null }) =>
  r.userId !== uid(req) && (approver(req) || r.project?.managerId === uid(req));

const shape = <T extends { project: { managerId: number | null; id: number; name: string; color: string } | null }>(r: T) => {
  const { project, ...rest } = r;
  return { ...rest, project: project ? { id: project.id, name: project.name, color: project.color } : null };
};

reimbursementsRouter.get("/", async (req, res) => {
  const q = z.object({ scope: z.enum(["mine", "approvals"]).default("mine"), status: z.string().optional() }).parse(req.query);
  const statuses = q.status ? q.status.split(",").filter((s): s is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(s)) : [];
  const where: Prisma.ReimbursementWhereInput = { companyId: cid(req), ...(statuses.length ? { status: { in: statuses } } : {}) };
  if (q.scope === "mine") where.userId = uid(req);
  else {
    where.userId = { not: uid(req) };
    if (!approver(req)) where.project = { managerId: uid(req) };
  }
  const rows = await prisma.reimbursement.findMany({ where, include, orderBy: q.scope === "approvals" ? [{ date: "asc" }, { id: "asc" }] : [{ date: "desc" }, { id: "desc" }], take: 1000 });
  res.json(rows.map(shape));
});

reimbursementsRouter.post("/", async (req, res) => {
  const d = bodySchema.extend({ category: z.enum(CATEGORIES).default("OTHER") }).parse(req.body);
  await checkBody(req, d);
  const r = await prisma.reimbursement.create({
    data: { companyId: cid(req), userId: uid(req), date: d.date, amount: d.amount, currency: req.company!.currency, category: d.category, description: d.description, projectId: d.projectId ?? null, receiptUrl: d.receiptUrl || null },
    include,
  });
  await audit(req, "reimbursement_requested", "reimbursement", r.id, { new: d });
  const to = await approverIds(cid(req), uid(req));
  if (r.project?.managerId && r.project.managerId !== uid(req)) to.push(r.project.managerId);
  await notify(to, { companyId: cid(req), type: "REIMBURSEMENT_REQUESTED", title: `${req.user!.name} requested a reimbursement of ${r.currency} ${r.amount.toLocaleString("en-IN")}`, body: d.description, link: "/approvals?tab=reimbursements" });
  res.status(201).json(shape(r));
});

async function own(req: Request) {
  const r = await prisma.reimbursement.findFirst({ where: { id: Number(req.params.id), companyId: cid(req), userId: uid(req) } });
  if (!r) throw new HttpError(404, "Reimbursement request not found");
  if (r.status !== "PENDING") throw new HttpError(409, "Only pending requests can be changed");
  return r;
}

reimbursementsRouter.patch("/:id", async (req, res) => {
  const old = await own(req);
  const d = bodySchema.partial().parse(req.body);
  await checkBody(req, { date: d.date ?? old.date, projectId: d.projectId });
  const r = await prisma.reimbursement.update({
    where: { id: old.id },
    data: {
      ...(d.date !== undefined ? { date: d.date } : {}), ...(d.amount !== undefined ? { amount: d.amount } : {}), ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}), ...(d.projectId !== undefined ? { projectId: d.projectId ?? null } : {}),
      ...(d.receiptUrl !== undefined ? { receiptUrl: d.receiptUrl || null } : {}),
    },
    include,
  });
  await audit(req, "reimbursement_updated", "reimbursement", r.id, { old: { date: old.date, amount: old.amount, category: old.category, description: old.description, projectId: old.projectId }, new: d });
  res.json(shape(r));
});

reimbursementsRouter.post("/:id/cancel", async (req, res) => {
  const r = await own(req);
  await prisma.reimbursement.update({ where: { id: r.id }, data: { status: "CANCELLED" } });
  await audit(req, "reimbursement_cancelled", "reimbursement", r.id);
  res.json({ ok: true });
});

for (const action of ["approve", "reject"] as const) {
  reimbursementsRouter.post(`/:id/${action}`, async (req, res) => {
    const { note } = z.object({ note: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
    const r = await prisma.reimbursement.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) }, include });
    if (!r) throw new HttpError(404, "Reimbursement request not found");
    if (r.userId === uid(req)) throw new HttpError(403, "You can't review your own reimbursement");
    if (!canReview(req, r)) throw new HttpError(403, "You don't have permission to review reimbursements");
    if (r.status !== "PENDING") throw new HttpError(409, "This request was already reviewed");
    if (action === "reject" && !note) throw new HttpError(400, "Add a note explaining why");
    const status = action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await prisma.reimbursement.update({ where: { id: r.id }, data: { status, reviewerId: uid(req), reviewedAt: new Date(), reviewNote: note || null }, include });
    await audit(req, action === "approve" ? "reimbursement_approved" : "reimbursement_rejected", "reimbursement", r.id, { old: { status: r.status }, new: { status }, reason: note });
    await notify([r.userId], {
      companyId: cid(req), type: action === "approve" ? "REIMBURSEMENT_APPROVED" : "REIMBURSEMENT_REJECTED",
      title: `Your reimbursement of ${r.currency} ${r.amount.toLocaleString("en-IN")} was ${action === "approve" ? "approved" : "declined"}`, body: note || r.description, link: "/reimbursements",
    });
    res.json(shape(updated));
  });
}
