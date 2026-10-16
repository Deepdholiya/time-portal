// Roadmap, calendar and leave.
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, audit, notify, companySettings } from "../db.js";
import { HttpError, can, cid, requirePerm, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { projectStats } from "../health.js";
import { DATE } from "../scope.js";
import { timeInclude } from "./time.js";
import { today, workingDays } from "../weeks.js";

export const roadmapRouter = Router();
export const calendarRouter = Router();
export const leaveRouter = Router();

// ---------- Roadmap ----------
roadmapRouter.get("/", requirePerm("roadmap", "view"), async (req, res) => {
  const q = z.object({
    projectId: z.coerce.number().int().optional(), userId: z.coerce.number().int().optional(), teamId: z.coerce.number().int().optional(),
    status: z.string().optional(), health: z.string().optional(), initiativeId: z.coerce.number().int().optional(),
    from: DATE.optional(), to: DATE.optional(), tasks: z.enum(["true", "false"]).default("true"),
  }).parse(req.query);
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const where: Prisma.ProjectWhereInput = { companyId: cid(req), parentId: null, archived: false };
  if (q.projectId) where.id = q.projectId;
  if (q.status) where.status = { in: q.status.split(",") };
  if (q.teamId) where.teamId = q.teamId;
  if (q.initiativeId) where.initiativeId = q.initiativeId;
  if (q.userId) where.OR = [{ managerId: q.userId }, { members: { some: { userId: q.userId } } }, { tasks: { some: { assigneeId: q.userId } } }];
  if (q.from || q.to) where.AND = [{ OR: [{ endDate: null }, { endDate: { gte: q.from ?? "0000" } }] }, { OR: [{ startDate: null }, { startDate: { lte: q.to ?? "9999" } }] }];
  const projects = await prisma.project.findMany({
    where,
    include: {
      initiative: true, manager: { select: { id: true, name: true } }, client: { select: { name: true } },
      children: { where: { archived: false }, select: { id: true, name: true, startDate: true, endDate: true, status: true, color: true } },
      milestones: { orderBy: { date: "asc" } },
    },
    orderBy: [{ startDate: "asc" }, { name: "asc" }],
  });
  const stats = await projectStats(cid(req), projects.map((p) => p.id));
  let list = projects.map((p) => {
    const s = stats.get(p.id);
    return {
      id: p.id, name: p.name, color: p.color, status: p.status, startDate: p.startDate, endDate: p.endDate, initiative: p.initiative, manager: p.manager, client: p.client?.name ?? null,
      health: s?.health ?? "ON_TRACK", reasons: s?.reasons ?? [], progress: s?.progress ?? 0, access: ids === "all" || ids.includes(p.id) ? "member" : "none",
      children: p.children, milestones: p.milestones,
    };
  });
  if (q.health) list = list.filter((p) => q.health!.split(",").includes(p.health));
  const projectIds = list.flatMap((p) => [p.id, ...p.children.map((c) => c.id)]);
  const key = companySettings(req.company!).taskKey;
  const tasks = q.tasks === "true" ? await prisma.task.findMany({
    where: { companyId: cid(req), projectId: { in: projectIds }, parentId: null, OR: [{ startDate: { not: null } }, { dueDate: { not: null } }], ...(q.userId ? { assigneeId: q.userId } : {}) },
    select: { id: true, number: true, title: true, status: true, priority: true, startDate: true, dueDate: true, projectId: true, milestoneId: true, assignee: { select: { id: true, name: true } }, blockedBy: { select: { blockerId: true, blocker: { select: { dueDate: true, status: true } } } } },
    orderBy: [{ startDate: "asc" }, { dueDate: "asc" }],
  }) : [];
  const deps = tasks.flatMap((t) => t.blockedBy.map((b) => {
    const begins = t.startDate ?? t.dueDate;
    return { from: b.blockerId, to: t.id, conflict: !!(b.blocker.dueDate && begins && b.blocker.status !== "DONE" && b.blocker.dueDate >= begins) };
  }));
  res.json({
    canEdit: can(req, "roadmap", "edit"),
    projects: list,
    tasks: tasks.map(({ blockedBy: _b, ...t }) => ({ ...t, key: `${key}-${t.number}`, conflict: deps.some((d) => d.to === t.id && d.conflict), overdue: !!t.dueDate && t.status !== "DONE" && t.dueDate < today() })),
    dependencies: deps,
    initiatives: await prisma.initiative.findMany({ where: { companyId: cid(req) } }),
  });
});

// ---------- Calendar ----------
calendarRouter.get("/", async (req, res) => {
  const q = z.object({ from: DATE, to: DATE, userId: z.string().optional() }).parse(req.query);
  const everyone = q.userId === "all";
  let userId = uid(req);
  if (q.userId && !everyone && Number(q.userId) !== userId) {
    if (!can(req, "timesheetsView", "all")) throw new HttpError(403, "You can only see your own calendar");
    userId = Number(q.userId);
  }
  if (everyone && !can(req, "timesheetsView", "all")) throw new HttpError(403, "You can only see your own calendar");
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const key = companySettings(req.company!).taskKey;
  const [entries, tasks, milestones, leave, holidays] = await Promise.all([
    prisma.timeEntry.findMany({ where: { companyId: cid(req), ...(everyone ? {} : { userId }), date: { gte: q.from, lte: q.to }, running: false }, include: timeInclude, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 3000 }),
    prisma.task.findMany({
      where: { companyId: cid(req), ...(everyone ? {} : { assigneeId: userId }), OR: [{ dueDate: { gte: q.from, lte: q.to } }, { startDate: { gte: q.from, lte: q.to } }] },
      select: { id: true, number: true, title: true, status: true, priority: true, startDate: true, dueDate: true, project: { select: { name: true, color: true } }, assignee: { select: { name: true } } },
    }),
    prisma.milestone.findMany({ where: { date: { gte: q.from, lte: q.to }, project: { companyId: cid(req), archived: false, ...(ids === "all" ? {} : { id: { in: ids } }) } }, include: { project: { select: { id: true, name: true, color: true } } } }),
    prisma.leaveRequest.findMany({ where: { companyId: cid(req), status: { in: ["APPROVED", "PENDING"] }, from: { lte: q.to }, to: { gte: q.from }, ...(everyone || can(req, "leaveApprove", "yes") ? {} : { OR: [{ userId }, { status: "APPROVED" }] }) }, include: { user: { select: { id: true, name: true } } } }),
    prisma.holiday.findMany({ where: { companyId: cid(req), date: { gte: q.from, lte: q.to } } }),
  ]);
  res.json({
    canReschedule: can(req, "tasks", "manage"),
    entries, milestones, leave, holidays,
    tasks: tasks.map((t) => ({ ...t, key: `${key}-${t.number}` })),
  });
});

// ---------- Leave ----------
const leaveSchema = z.object({ type: z.enum(["VACATION", "SICK", "PERSONAL", "OTHER"]).default("VACATION"), from: DATE, to: DATE, halfDay: z.boolean().default(false), reason: z.string().max(1000).nullish() });

leaveRouter.get("/", async (req, res) => {
  const rows = await prisma.leaveRequest.findMany({ where: { companyId: cid(req), userId: uid(req) }, include: { reviewedBy: { select: { name: true } } }, orderBy: { from: "desc" } });
  const c = req.company!;
  const holidays = new Set((await prisma.holiday.findMany({ where: { companyId: c.id } })).map((h) => h.date));
  res.json(rows.map((r) => ({ ...r, days: workingDays(r.from, r.to, c.workWeek, holidays) * (r.halfDay ? 0.5 : 1) })));
});

leaveRouter.post("/", async (req, res) => {
  const d = leaveSchema.parse(req.body);
  if (d.to < d.from) throw new HttpError(400, "The end date must be on or after the start date");
  const clash = await prisma.leaveRequest.findFirst({ where: { companyId: cid(req), userId: uid(req), status: { in: ["PENDING", "APPROVED"] }, from: { lte: d.to }, to: { gte: d.from } } });
  if (clash) throw new HttpError(409, `You already have leave from ${clash.from} to ${clash.to}`);
  const l = await prisma.leaveRequest.create({ data: { companyId: cid(req), userId: uid(req), ...d, reason: d.reason ?? null } });
  await audit(req, "leave_requested", "leave", l.id, { new: d });
  const approvers = await prisma.user.findMany({ where: { role: { in: ["MANAGER", "ADMIN"] }, status: "ACTIVE", id: { not: uid(req) }, memberships: { some: { companyId: cid(req) } } }, select: { id: true } });
  await notify(approvers.map((a) => a.id), { companyId: cid(req), type: "LEAVE_REQUESTED", title: `${req.user!.name} requested leave ${d.from} to ${d.to}`, link: "/approvals?tab=leave" });
  res.status(201).json(l);
});

leaveRouter.post("/:id/cancel", async (req, res) => {
  const l = await prisma.leaveRequest.findFirst({ where: { id: Number(req.params.id), companyId: cid(req), userId: uid(req) } });
  if (!l) throw new HttpError(404, "Leave request not found");
  if (l.status === "APPROVED" && l.from <= today()) throw new HttpError(409, "Leave that has started can't be cancelled. Ask your manager.");
  await prisma.leaveRequest.update({ where: { id: l.id }, data: { status: "CANCELLED" } });
  await audit(req, "leave_cancelled", "leave", l.id);
  res.json({ ok: true });
});

leaveRouter.get("/approvals", requirePerm("leaveApprove", "yes"), async (req, res) => {
  const { status } = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING") }).parse(req.query);
  const rows = await prisma.leaveRequest.findMany({ where: { companyId: cid(req), status, userId: { not: uid(req) } }, include: { user: { select: { id: true, name: true } }, reviewedBy: { select: { name: true } } }, orderBy: { from: "asc" } });
  const c = req.company!;
  const holidays = new Set((await prisma.holiday.findMany({ where: { companyId: c.id } })).map((h) => h.date));
  res.json(rows.map((r) => ({ ...r, days: workingDays(r.from, r.to, c.workWeek, holidays) * (r.halfDay ? 0.5 : 1) })));
});

leaveRouter.post("/:id/review", requirePerm("leaveApprove", "yes"), async (req, res) => {
  const d = z.object({ status: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(1000).optional() }).parse(req.body);
  const l = await prisma.leaveRequest.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) } });
  if (!l) throw new HttpError(404, "Leave request not found");
  if (l.userId === uid(req)) throw new HttpError(403, "You can't approve your own leave");
  if (l.status !== "PENDING") throw new HttpError(409, "This request was already reviewed");
  if (d.status === "REJECTED" && !d.note?.trim()) throw new HttpError(400, "Add a note explaining why");
  await prisma.leaveRequest.update({ where: { id: l.id }, data: { status: d.status, reviewNote: d.note ?? null, reviewedById: uid(req) } });
  await audit(req, d.status === "APPROVED" ? "leave_approved" : "leave_rejected", "leave", l.id, { old: { status: l.status }, new: { status: d.status }, reason: d.note });
  await notify([l.userId], { companyId: cid(req), type: "LEAVE_REVIEWED", title: `Your leave ${l.from} to ${l.to} was ${d.status === "APPROVED" ? "approved" : "declined"}`, body: d.note, link: "/calendar" });
  res.json({ ok: true });
});

