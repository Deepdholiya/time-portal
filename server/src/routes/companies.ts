import { Router } from "express";
import { z } from "zod";
import { prisma, audit, companySettings, DEFAULT_SETTINGS } from "../db.js";
import { HttpError, cid, requirePerm, uid } from "../auth.js";

export const companiesRouter = Router();
const canCompanies = requirePerm("companies", "yes");

const companySchema = z.object({
  name: z.string().trim().min(1, "Name the company").max(100),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#5e6ad2"),
  logoUrl: z.string().url().or(z.literal("")).nullish(),
  country: z.string().trim().max(60).default("India"),
  timezone: z.string().trim().max(60).default("Asia/Kolkata"),
  currency: z.string().trim().length(3).default("INR"),
  workWeek: z.string().regex(/^[1-7](,[1-7])*$/, "Pick at least one working day").default("1,2,3,4,5"),
  weekStartsOn: z.number().int().min(1).max(7).default(1),
  hoursPerDay: z.number().min(1).max(24).default(8),
  billingNotes: z.string().max(2000).nullish(),
  taskKey: z.string().trim().regex(/^[A-Z]{2,5}$/, "Use 2 to 5 capital letters").optional(),
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";

companiesRouter.get("/", canCompanies, async (req, res) => {
  const rows = await prisma.company.findMany({
    include: { _count: { select: { memberships: true, projects: true, clients: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  res.json(rows.map((c) => ({ ...c, settings: companySettings(c), current: c.id === cid(req) })));
});

companiesRouter.post("/", canCompanies, async (req, res) => {
  const { taskKey, ...d } = companySchema.parse(req.body);
  let slug = slugify(d.name);
  for (let i = 2; await prisma.company.findUnique({ where: { slug } }); i++) slug = `${slugify(d.name)}-${i}`;
  const c = await prisma.company.create({ data: { ...d, logoUrl: d.logoUrl || null, slug, settings: JSON.stringify({ ...DEFAULT_SETTINGS, taskKey: taskKey ?? d.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(2, "X") }) } });
  // The creator joins the new company so they can switch into it.
  await prisma.membership.create({ data: { companyId: c.id, userId: uid(req) } });
  await audit(req, "company_created", "company", c.id, { companyId: c.id, new: d });
  res.status(201).json(c);
});

companiesRouter.put("/:id", canCompanies, async (req, res) => {
  const c = await prisma.company.findUnique({ where: { id: Number(req.params.id) } });
  if (!c) throw new HttpError(404, "Company not found");
  const { taskKey, ...d } = companySchema.parse(req.body);
  const settings = { ...companySettings(c), ...(taskKey ? { taskKey } : {}) };
  const updated = await prisma.company.update({ where: { id: c.id }, data: { ...d, logoUrl: d.logoUrl || null, settings: JSON.stringify(settings) } });
  await audit(req, "company_updated", "company", c.id, { companyId: c.id, old: c, new: d });
  res.json(updated);
});

companiesRouter.post("/:id/status", canCompanies, async (req, res) => {
  const c = await prisma.company.findUnique({ where: { id: Number(req.params.id) } });
  if (!c) throw new HttpError(404, "Company not found");
  const { status } = z.object({ status: z.enum(["ACTIVE", "ARCHIVED"]) }).parse(req.body);
  if (status === "ARCHIVED" && (await prisma.company.count({ where: { status: "ACTIVE" } })) <= 1) throw new HttpError(400, "Keep at least one active company");
  await prisma.company.update({ where: { id: c.id }, data: { status } });
  await audit(req, status === "ARCHIVED" ? "company_archived" : "company_restored", "company", c.id, { companyId: c.id, old: { status: c.status }, new: { status } });
  res.json({ ok: true });
});

companiesRouter.get("/:id/members", canCompanies, async (req, res) => {
  const rows = await prisma.membership.findMany({ where: { companyId: Number(req.params.id) }, include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } } });
  res.json(rows.map((r) => r.user));
});

companiesRouter.post("/:id/members", canCompanies, async (req, res) => {
  const companyId = Number(req.params.id);
  const { userIds } = z.object({ userIds: z.array(z.number().int()).min(1) }).parse(req.body);
  for (const userId of userIds) await prisma.membership.upsert({ where: { companyId_userId: { companyId, userId } }, update: {}, create: { companyId, userId } });
  await audit(req, "company_members_added", "company", companyId, { companyId, new: { userIds } });
  res.json({ ok: true });
});

companiesRouter.delete("/:id/members/:userId", canCompanies, async (req, res) => {
  const companyId = Number(req.params.id), userId = Number(req.params.userId);
  if ((await prisma.membership.count({ where: { userId } })) <= 1) throw new HttpError(400, "That person must stay in at least one company. Deactivate them instead.");
  await prisma.membership.delete({ where: { companyId_userId: { companyId, userId } } });
  await audit(req, "company_member_removed", "company", companyId, { companyId, old: { userId } });
  res.json({ ok: true });
});
