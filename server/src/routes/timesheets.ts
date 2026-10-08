import { Router } from "express";
import { z } from "zod";
import { prisma, audit, notify } from "../db.js";
import { HttpError, can, cid, requirePerm, uid } from "../auth.js";
import { weekStartOf, weekEndOf } from "../weeks.js";
import { DATE, entryInclude, filtersSchema, timeWhere, topProject, subProject, clientOf, teamOf } from "../scope.js";

export const timesheetsRouter = Router();

const ws = (company: { weekStartsOn: number }, d: string) => weekStartOf(d, company.weekStartsOn);

timesheetsRouter.get("/", async (req, res) => {
  const q = z.object({ weekStart: DATE, userId: z.coerce.number().int().optional() }).parse(req.query);
  let userId = uid(req);
  if (q.userId && q.userId !== userId) {
    if (!can(req, "timesheetsView", "all")) throw new HttpError(403, "You can only see your own timesheet");
    userId = q.userId;
  }
  const p = await prisma.timesheetPeriod.findUnique({
    where: { companyId_userId_weekStart: { companyId: cid(req), userId, weekStart: ws(req.company!, q.weekStart) } },
    include: { reviewedBy: { select: { name: true } } },
  });
  res.json(p);
});

timesheetsRouter.post("/submit", async (req, res) => {
  const { weekStart } = z.object({ weekStart: DATE }).parse(req.body);
  const start = ws(req.company!, weekStart);
  const userId = uid(req);
  const range = { gte: start, lte: weekEndOf(start) };
  if (await prisma.timeEntry.findFirst({ where: { companyId: cid(req), userId, running: true, date: range } })) throw new HttpError(409, "Stop the running timer before submitting this week");
  if (!(await prisma.timeEntry.count({ where: { companyId: cid(req), userId, date: range } }))) throw new HttpError(400, "There's no time logged in this week");
  const key = { companyId_userId_weekStart: { companyId: cid(req), userId, weekStart: start } };
  const existing = await prisma.timesheetPeriod.findUnique({ where: key });
  if (existing && existing.status !== "REJECTED") throw new HttpError(409, "This week is already submitted");
  const period = existing
    ? await prisma.timesheetPeriod.update({ where: { id: existing.id }, data: { status: "SUBMITTED", submittedAt: new Date(), note: null, reviewedAt: null, reviewedById: null } })
    : await prisma.timesheetPeriod.create({ data: { companyId: cid(req), userId, weekStart: start } });
  await audit(req, "timesheet_submitted", "timesheet", period.id, { new: { weekStart: start } });
  const approvers = await prisma.user.findMany({ where: { role: { in: ["MANAGER", "ADMIN"] }, status: "ACTIVE", memberships: { some: { companyId: cid(req) } }, id: { not: userId } }, select: { id: true } });
  await notify(approvers.map((a) => a.id), { companyId: cid(req), type: "TIMESHEET_SUBMITTED", title: `${req.user!.name} submitted the week of ${start}`, link: "/approvals" });
  res.json(period);
});

timesheetsRouter.post("/withdraw", async (req, res) => {
  const { weekStart } = z.object({ weekStart: DATE }).parse(req.body);
  const p = await prisma.timesheetPeriod.findUnique({ where: { companyId_userId_weekStart: { companyId: cid(req), userId: uid(req), weekStart: ws(req.company!, weekStart) } } });
  if (!p || p.status !== "SUBMITTED") throw new HttpError(409, "Only a submitted week that hasn't been reviewed can be withdrawn");
  await prisma.timesheetPeriod.delete({ where: { id: p.id } });
  await audit(req, "timesheet_withdrawn", "timesheet", p.id, { old: { weekStart: p.weekStart, status: p.status } });
  res.json({ ok: true });
});

timesheetsRouter.get("/approvals", requirePerm("approveTimesheets", "yes"), async (req, res) => {
  const q = z.object({ status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).default("SUBMITTED") }).parse(req.query);
  const periods = await prisma.timesheetPeriod.findMany({
    where: { companyId: cid(req), status: q.status, userId: { not: uid(req) } },
    include: { user: { select: { id: true, name: true, weeklyCapacity: true, memberships: { where: { companyId: cid(req) }, select: { team: { select: { name: true } } } } } }, reviewedBy: { select: { name: true } } },
    orderBy: [{ weekStart: "desc" }, { submittedAt: "asc" }],
    take: 200,
  });
  const out = [];
  for (const p of periods) {
    const entries = await prisma.timeEntry.findMany({
      where: { companyId: cid(req), userId: p.userId, running: false, date: { gte: p.weekStart, lte: weekEndOf(p.weekStart) } },
      select: { minutes: true, billable: true, date: true, project: { select: { name: true, color: true, parent: { select: { name: true, color: true } } } } },
    });
    const byProject = new Map<string, { name: string; color: string; minutes: number }>();
    const byDay: Record<string, number> = {};
    for (const e of entries) {
      const top = e.project.parent ?? e.project;
      const g = byProject.get(top.name) ?? { name: top.name, color: top.color, minutes: 0 };
      g.minutes += e.minutes; byProject.set(top.name, g);
      byDay[e.date] = (byDay[e.date] ?? 0) + e.minutes;
    }
    out.push({
      ...p,
      user: { id: p.user.id, name: p.user.name, weeklyCapacity: p.user.weeklyCapacity, team: p.user.memberships[0]?.team ?? null },
      minutes: entries.reduce((s, e) => s + e.minutes, 0),
      billableMinutes: entries.reduce((s, e) => s + (e.billable ? e.minutes : 0), 0),
      projects: [...byProject.values()].sort((a, b) => b.minutes - a.minutes),
      byDay,
    });
  }
  res.json(out);
});

async function review(req: Parameters<typeof cid>[0], id: number, status: "APPROVED" | "REJECTED", note?: string) {
  const p = await prisma.timesheetPeriod.findFirst({ where: { id, companyId: cid(req) } });
  if (!p) throw new HttpError(404, "Timesheet not found");
  if (p.userId === uid(req)) throw new HttpError(403, "You can't review your own timesheet");
  if (status === "APPROVED" && p.status !== "SUBMITTED") throw new HttpError(409, "Only submitted weeks can be approved");
  // Reopening an approved week is an unlock: admins only, with a reason.
  if (status === "REJECTED" && p.status === "APPROVED" && req.user!.role !== "ADMIN") throw new HttpError(403, "Only an admin can unlock an approved week");
  const updated = await prisma.timesheetPeriod.update({ where: { id }, data: { status, note: note ?? null, reviewedAt: new Date(), reviewedById: uid(req) } });
  const action = status === "APPROVED" ? "timesheet_approved" : p.status === "APPROVED" ? "timesheet_unlocked" : "timesheet_rejected";
  await audit(req, action, "timesheet", id, { old: { status: p.status }, new: { status, userId: p.userId, weekStart: p.weekStart }, reason: note });
  await notify([p.userId], {
    companyId: cid(req), type: status === "APPROVED" ? "TIMESHEET_APPROVED" : "TIMESHEET_REJECTED",
    title: status === "APPROVED" ? `Your week of ${p.weekStart} was approved` : `Your week of ${p.weekStart} was sent back`,
    body: note, link: `/timesheet?week=${p.weekStart}`,
  });
  return updated;
}

timesheetsRouter.post("/:id/approve", requirePerm("approveTimesheets", "yes"), async (req, res) => {
  res.json(await review(req, Number(req.params.id), "APPROVED"));
});

timesheetsRouter.post("/:id/reject", requirePerm("approveTimesheets", "yes"), async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(1, "Say what needs fixing, or why you're unlocking it").max(1000) }).parse(req.body);
  res.json(await review(req, Number(req.params.id), "REJECTED", note));
});

timesheetsRouter.post("/bulk-approve", requirePerm("approveTimesheets", "yes"), async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int()).min(1).max(200) }).parse(req.body);
  let done = 0;
  for (const id of ids) { try { await review(req, id, "APPROVED"); done++; } catch { /* skip */ } }
  res.json({ approved: done });
});

// Combined timesheet for managers and admins: rows by employee or project, columns by day.
timesheetsRouter.get("/combined", requirePerm("timesheetsView", "all"), async (req, res) => {
  const f = filtersSchema.parse(req.query);
  const { groupBy } = z.object({ groupBy: z.enum(["employee", "project", "client", "subProject", "task"]).default("employee") }).parse(req.query);
  const entries = await prisma.timeEntry.findMany({ where: timeWhere(req, f, "all"), include: entryInclude, orderBy: [{ date: "asc" }] });
  type Row = { key: string; label: string; color?: string; sub?: string; days: Record<string, number>; minutes: number; billableMinutes: number; entries: number; userId?: number };
  const rows = new Map<string, Row>();
  for (const e of entries) {
    const top = topProject(e), sp = subProject(e), cl = clientOf(e);
    const [key, label, color, sub] =
      groupBy === "employee" ? [`u${e.user.id}`, e.user.name, undefined, teamOf(e, cid(req))?.name]
      : groupBy === "project" ? [`p${top.id}`, top.name, top.color, cl?.name]
      : groupBy === "subProject" ? [`s${sp?.id ?? top.id}`, sp ? `${top.name} › ${sp.name}` : top.name, top.color, cl?.name]
      : groupBy === "client" ? [`c${cl?.id ?? 0}`, cl?.name ?? "No client", undefined, undefined]
      : [`t${e.task?.id ?? 0}`, e.task ? e.task.title : "No task", top.color, top.name];
    let r = rows.get(key);
    if (!r) { r = { key, label, color, sub, days: {}, minutes: 0, billableMinutes: 0, entries: 0, userId: groupBy === "employee" ? e.user.id : undefined }; rows.set(key, r); }
    r.days[e.date] = (r.days[e.date] ?? 0) + e.minutes;
    r.minutes += e.minutes;
    if (e.billable) r.billableMinutes += e.minutes;
    r.entries++;
  }
  const periods = groupBy === "employee"
    ? await prisma.timesheetPeriod.findMany({ where: { companyId: cid(req), weekStart: { gte: weekStartOf(f.from, req.company!.weekStartsOn), lte: f.to } }, select: { userId: true, weekStart: true, status: true } })
    : [];
  res.json({ rows: [...rows.values()].sort((a, b) => b.minutes - a.minutes), periods, total: entries.reduce((s, e) => s + e.minutes, 0) });
});
