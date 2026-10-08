import { Router, type Request } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, companySettings, audit } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { DATE, filtersSchema, loadEntries, analyticsLevel, topProject, subProject, clientOf, teamOf, money, type RichEntry, type Filters } from "../scope.js";
import { projectStats } from "../health.js";
import { addDays, today, weekStartOf, workingDays, iso } from "../weeks.js";

export const analyticsRouter = Router();

export const GROUPS = ["employee", "project", "subProject", "task", "client", "team", "day", "week", "month", "billable"] as const;
export type GroupBy = (typeof GROUPS)[number];

export type Group = { key: string; id: number | string | null; name: string; color?: string; sub?: string; minutes: number; billableMinutes: number; entries: number; revenue?: number; cost?: number; estimateHours?: number | null };

// Groups entries by one dimension. Ids are returned so the client can drill into the next level with a filter.
export function aggregate(req: Request, entries: RichEntry[], by: GroupBy, withMoney: boolean) {
  const map = new Map<string, Group>();
  for (const e of entries) {
    const top = topProject(e), sp = subProject(e), cl = clientOf(e);
    let id: number | string | null, name: string, color: string | undefined, sub: string | undefined, estimateHours: number | null | undefined;
    switch (by) {
      case "employee": id = e.user.id; name = e.user.name; sub = teamOf(e, cid(req))?.name; break;
      case "project": id = top.id; name = top.name; color = top.color; sub = cl?.name; estimateHours = top.estimatedHours; break;
      case "subProject": id = sp?.id ?? null; name = sp ? sp.name : `${top.name} (no sub-project)`; color = top.color; sub = top.name; estimateHours = sp?.estimatedHours; break;
      case "task": id = e.task?.id ?? null; name = e.task?.title ?? "No task"; color = top.color; sub = sp ? `${top.name} › ${sp.name}` : top.name; estimateHours = e.task?.estimateHours; break;
      case "client": id = cl?.id ?? null; name = cl?.name ?? "No client"; break;
      case "team": { const t = teamOf(e, cid(req)); id = t?.id ?? null; name = t?.name ?? "No team"; break; }
      case "day": id = e.date; name = e.date; break;
      case "week": id = weekStartOf(e.date, req.company!.weekStartsOn); name = id; break;
      case "month": id = e.date.slice(0, 7); name = id; break;
      case "billable": id = e.billable ? "true" : "false"; name = e.billable ? "Billable" : "Non-billable"; break;
    }
    const key = `${by}:${id}`;
    let g = map.get(key);
    if (!g) { g = { key, id, name, color, sub, minutes: 0, billableMinutes: 0, entries: 0, estimateHours, ...(withMoney ? { revenue: 0, cost: 0 } : {}) }; map.set(key, g); }
    g.minutes += e.minutes;
    if (e.billable) g.billableMinutes += e.minutes;
    g.entries++;
    if (withMoney) { const m = money(e); g.revenue! += m.revenue; g.cost! += m.cost; }
  }
  const out = [...map.values()];
  return ["day", "week", "month"].includes(by) ? out.sort((a, b) => String(a.id).localeCompare(String(b.id))) : out.sort((a, b) => b.minutes - a.minutes);
}

export function entryRow(req: Request, e: RichEntry) {
  const top = topProject(e), sp = subProject(e), cl = clientOf(e);
  return {
    id: e.id, date: e.date, week: weekStartOf(e.date, req.company!.weekStartsOn), startTime: e.startTime, endTime: e.endTime, minutes: e.minutes, description: e.description, billable: e.billable,
    user: { id: e.user.id, name: e.user.name }, team: teamOf(e, cid(req))?.name ?? null, client: cl?.name ?? null, clientId: cl?.id ?? null,
    project: top.name, projectId: top.id, projectColor: top.color, subProject: sp?.name ?? null, subProjectId: sp?.id ?? null,
    task: e.task ? e.task.title : null, taskId: e.task?.id ?? null, taskStatus: e.task?.status ?? null, milestone: e.task?.milestone?.name ?? null,
  };
}

async function capacityMinutes(req: Request, userIds: number[], from: string, to: string) {
  const company = req.company!;
  const end = to > today() ? today() : to; // utilization only counts days that have happened
  if (end < from) return 0;
  const holidays = new Set((await prisma.holiday.findMany({ where: { companyId: company.id, date: { gte: from, lte: end } } })).map((h) => h.date));
  const days = workingDays(from, end, company.workWeek, holidays);
  const perDay = company.workWeek.split(",").length || 5;
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, weeklyCapacity: true } });
  const leave = await leaveDays(company.id, userIds, from, end, company.workWeek, holidays);
  return users.reduce((s, u) => s + Math.max(0, days - (leave.get(u.id) ?? 0)) * (u.weeklyCapacity / perDay) * 60, 0);
}

export async function leaveDays(companyId: number, userIds: number[], from: string, to: string, workWeek: string, holidays: Set<string>) {
  const rows = await prisma.leaveRequest.findMany({ where: { companyId, userId: { in: userIds }, status: "APPROVED", from: { lte: to }, to: { gte: from } } });
  const out = new Map<number, number>();
  for (const l of rows) {
    const n = workingDays(l.from > from ? l.from : from, l.to < to ? l.to : to, workWeek, holidays) * (l.halfDay ? 0.5 : 1);
    out.set(l.userId, (out.get(l.userId) ?? 0) + n);
  }
  return out;
}

const viewSchema = z.object({ view: z.enum(["my", "team", "company"]).default("my"), groupBy: z.enum(GROUPS).optional() });

// Filters adjusted for the chosen dashboard view: My view is always the caller's own time.
async function scoped(req: Request) {
  const f = filtersSchema.parse(req.query);
  const { view } = viewSchema.parse(req.query);
  let level = analyticsLevel(req);
  if (view === "my") level = "own";
  if (view === "team" && level === "all") {
    const m = await prisma.membership.findUnique({ where: { companyId_userId: { companyId: cid(req), userId: uid(req) } } });
    if (m?.teamId && !f.teamId) f.teamId = [m.teamId];
  }
  return { f, level, view };
}

// Task statistics for the same scope as the time figures.
async function taskStats(req: Request, f: Filters, level: "own" | "all") {
  const t0 = today();
  const where: Prisma.TaskWhereInput = { companyId: cid(req) };
  if (level === "own") where.assigneeId = uid(req);
  else if (f.userId) where.assigneeId = { in: f.userId };
  if (f.teamId) where.assignee = { memberships: { some: { companyId: cid(req), teamId: { in: f.teamId } } } };
  if (f.projectId) where.OR = [{ projectId: { in: f.projectId } }, { project: { parentId: { in: f.projectId } } }];
  if (f.subProjectId) where.projectId = { in: f.subProjectId };
  if (f.clientId) where.project = { OR: [{ clientId: { in: f.clientId } }, { parent: { clientId: { in: f.clientId } } }] };
  const [byStatus, completed, due, overdue, blocked] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.task.count({ where: { ...where, status: "DONE", completedAt: { gte: new Date(f.from + "T00:00:00"), lte: new Date(f.to + "T23:59:59") } } }),
    prisma.task.count({ where: { ...where, status: { not: "DONE" }, dueDate: { gte: f.from, lte: f.to } } }),
    prisma.task.count({ where: { ...where, status: { not: "DONE" }, dueDate: { lt: t0 } } }),
    prisma.task.count({ where: { ...where, status: { not: "DONE" }, OR: [{ status: "BLOCKED" }, { blockedBy: { some: { blocker: { status: { not: "DONE" } } } } }] } }),
  ]);
  return { byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])), completed, due, overdue, blocked };
}

analyticsRouter.get("/dashboard", async (req, res) => {
  const { f, level, view } = await scoped(req);
  const entries = await loadEntries(req, f, level);
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const billable = entries.reduce((s, e) => s + (e.billable ? e.minutes : 0), 0);
  const tasks = await taskStats(req, f, level);
  const projectIds = new Set(entries.map((e) => topProject(e).id));
  const userIds = level === "own" ? [uid(req)] : [...new Set(entries.map((e) => e.user.id))];
  const capacity = await capacityMinutes(req, userIds.length ? userIds : [uid(req)], f.from, f.to);

  // Planned vs actual: estimates on tasks due in the range against time tracked on them.
  const plannedTasks = await prisma.task.findMany({
    where: { companyId: cid(req), dueDate: { gte: f.from, lte: f.to }, estimateHours: { not: null }, ...(level === "own" ? { assigneeId: uid(req) } : {}) },
    select: { id: true, estimateHours: true },
  });
  const plannedTracked = plannedTasks.length ? await prisma.timeEntry.aggregate({ where: { taskId: { in: plannedTasks.map((t) => t.id) }, running: false }, _sum: { minutes: true } }) : { _sum: { minutes: 0 } };

  // Today's schedule for the caller.
  const t0 = today();
  const [todayTasks, upcoming, milestones, leaveToday, holidays] = await Promise.all([
    prisma.task.findMany({ where: { companyId: cid(req), assigneeId: uid(req), status: { not: "DONE" }, OR: [{ dueDate: t0 }, { status: "IN_PROGRESS" }, { AND: [{ startDate: { lte: t0 } }, { dueDate: { gte: t0 } }] }] }, include: { project: { select: { name: true, color: true } } }, orderBy: [{ dueDate: "asc" }], take: 12 }),
    prisma.task.findMany({ where: { companyId: cid(req), assigneeId: uid(req), status: { not: "DONE" }, dueDate: { gt: t0, lte: addDays(t0, 7) } }, include: { project: { select: { name: true, color: true } } }, orderBy: { dueDate: "asc" }, take: 10 }),
    prisma.milestone.findMany({ where: { project: { companyId: cid(req), archived: false }, done: false, date: { gte: t0, lte: addDays(t0, 14) } }, include: { project: { select: { id: true, name: true, color: true } } }, orderBy: { date: "asc" }, take: 8 }),
    prisma.leaveRequest.findMany({ where: { companyId: cid(req), status: "APPROVED", from: { lte: t0 }, to: { gte: t0 } }, include: { user: { select: { id: true, name: true } } } }),
    prisma.holiday.findMany({ where: { companyId: cid(req), date: { gte: t0, lte: addDays(t0, 30) } }, orderBy: { date: "asc" } }),
  ]);
  const key = companySettings(req.company!).taskKey;
  const fin = can(req, "financials", "view") && level === "all";
  res.json({
    view, level, range: { from: f.from, to: f.to },
    kpis: {
      totalMinutes: total, billableMinutes: billable, nonBillableMinutes: total - billable,
      tasksCompleted: tasks.completed, tasksDue: tasks.due, overdueTasks: tasks.overdue, blockedTasks: tasks.blocked,
      activeProjects: projectIds.size, capacityMinutes: Math.round(capacity), utilization: capacity ? total / capacity : null, people: userIds.length,
      plannedHours: plannedTasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0), actualHoursOnPlanned: (plannedTracked._sum.minutes ?? 0) / 60,
      ...(fin ? { revenue: entries.reduce((s, e) => s + money(e).revenue, 0), cost: entries.reduce((s, e) => s + money(e).cost, 0) } : {}),
    },
    byProject: aggregate(req, entries, "project", false),
    byDay: aggregate(req, entries, "day", false),
    byEmployee: level === "all" ? aggregate(req, entries, "employee", false).slice(0, 12) : [],
    taskStatus: tasks.byStatus,
    schedule: {
      today: todayTasks.map((t) => ({ id: t.id, key: `${key}-${t.number}`, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate, project: t.project })),
      upcoming: upcoming.map((t) => ({ id: t.id, key: `${key}-${t.number}`, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate, project: t.project })),
      milestones, leave: leaveToday.map((l) => ({ id: l.id, user: l.user, type: l.type })), holidays,
    },
  });
});

// Main analytics: KPIs plus every grouping, project health and estimates vs actuals.
analyticsRouter.get("/", async (req, res) => {
  const f = filtersSchema.parse(req.query);
  const level = analyticsLevel(req);
  const entries = await loadEntries(req, f, level);
  const fin = can(req, "financials", "view") && level === "all";
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const billable = entries.reduce((s, e) => s + (e.billable ? e.minutes : 0), 0);
  const userIds = level === "own" ? [uid(req)] : f.userId ?? (await prisma.membership.findMany({ where: { companyId: cid(req), user: { status: "ACTIVE" }, ...(f.teamId ? { teamId: { in: f.teamId } } : {}) }, select: { userId: true } })).map((m) => m.userId);
  const capacity = await capacityMinutes(req, userIds, f.from, f.to);
  const tasks = await taskStats(req, f, level);
  const projectIds = [...new Set(entries.map((e) => topProject(e).id))];
  const stats = await projectStats(cid(req), level === "all" ? undefined : projectIds);
  const projects = await prisma.project.findMany({ where: { companyId: cid(req), parentId: null, archived: false, ...(level === "all" ? {} : { id: { in: projectIds } }) }, select: { id: true, name: true, color: true, estimatedHours: true, budget: true, status: true, manager: { select: { name: true } } } });
  const revenue = fin ? entries.reduce((s, e) => s + money(e).revenue, 0) : undefined;
  const cost = fin ? entries.reduce((s, e) => s + money(e).cost, 0) : undefined;

  // Attendance: days with time logged against working days, minus approved leave.
  const company = req.company!;
  const holidays = new Set((await prisma.holiday.findMany({ where: { companyId: company.id, date: { gte: f.from, lte: f.to } } })).map((h) => h.date));
  const end = f.to > today() ? today() : f.to;
  const wdays = end >= f.from ? workingDays(f.from, end, company.workWeek, holidays) : 0;
  const leave = await leaveDays(company.id, userIds, f.from, end, company.workWeek, holidays);
  const daysWorked = new Map<number, Set<string>>();
  for (const e of entries) { const s = daysWorked.get(e.user.id) ?? new Set(); s.add(e.date); daysWorked.set(e.user.id, s); }
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, weeklyCapacity: true } });
  const perDay = company.workWeek.split(",").length || 5;

  const byEmployee = aggregate(req, entries, "employee", fin).map((g) => {
    const u = users.find((x) => x.id === g.id);
    const lv = leave.get(Number(g.id)) ?? 0;
    const cap = u ? Math.max(0, wdays - lv) * (u.weeklyCapacity / perDay) * 60 : 0;
    return { ...g, capacityMinutes: Math.round(cap), utilization: cap ? g.minutes / cap : null, daysWorked: daysWorked.get(Number(g.id))?.size ?? 0, workingDays: wdays, leaveDays: lv };
  });
  const matrix = new Map<string, { projectId: number; project: string; color: string; userId: number; user: string; minutes: number }>();
  for (const e of entries) {
    const top = topProject(e);
    const k = `${top.id}:${e.user.id}`;
    const m = matrix.get(k) ?? { projectId: top.id, project: top.name, color: top.color, userId: e.user.id, user: e.user.name, minutes: 0 };
    m.minutes += e.minutes; matrix.set(k, m);
  }
  res.json({
    level, financials: fin,
    kpis: {
      totalMinutes: total, billableMinutes: billable, nonBillableMinutes: total - billable, entries: entries.length,
      capacityMinutes: Math.round(capacity), utilization: capacity ? total / capacity : null, people: new Set(entries.map((e) => e.user.id)).size,
      projects: projectIds.length, tasks: tasks.byStatus, overdueTasks: tasks.overdue, blockedTasks: tasks.blocked, tasksCompleted: tasks.completed,
      revenue, cost, profit: fin ? revenue! - cost! : undefined, margin: fin && revenue ? (revenue - cost!) / revenue : undefined,
    },
    byEmployee,
    byProject: aggregate(req, entries, "project", fin),
    bySubProject: aggregate(req, entries, "subProject", fin),
    byTask: aggregate(req, entries, "task", false).slice(0, 25),
    byClient: aggregate(req, entries, "client", fin),
    byTeam: aggregate(req, entries, "team", fin),
    byDay: aggregate(req, entries, "day", false),
    byWeek: aggregate(req, entries, "week", false),
    matrix: [...matrix.values()],
    health: projects.map((p) => {
      const s = stats.get(p.id);
      return {
        id: p.id, name: p.name, color: p.color, manager: p.manager?.name ?? null, status: p.status, estimatedHours: p.estimatedHours,
        trackedHours: (s?.trackedMinutes ?? 0) / 60, progress: s?.progress ?? 0, health: s?.health ?? "ON_TRACK", reasons: s?.reasons ?? [],
        overdue: s?.tasks.overdue ?? 0, blocked: s?.tasks.blocked ?? 0, nextMilestone: s?.nextMilestone ?? null,
        ...(fin ? { budget: p.budget, budgetConsumed: s?.budgetConsumed ?? null, revenue: s?.revenue, cost: s?.cost } : {}),
      };
    }).sort((a, b) => ({ DELAYED: 0, AT_RISK: 1, ON_TRACK: 2 })[a.health] - ({ DELAYED: 0, AT_RISK: 1, ON_TRACK: 2 })[b.health]),
  });
});

// One level of drill-down: group the filtered time by a dimension. Add the group's id as a filter to go deeper.
analyticsRouter.get("/group", async (req, res) => {
  const f = filtersSchema.parse(req.query);
  const { groupBy } = z.object({ groupBy: z.enum(GROUPS) }).parse(req.query);
  const level = analyticsLevel(req);
  const entries = await loadEntries(req, f, level);
  res.json(aggregate(req, entries, groupBy, can(req, "financials", "view") && level === "all"));
});

// Exact time entries behind any total.
analyticsRouter.get("/entries", async (req, res) => {
  const f = filtersSchema.parse(req.query);
  const { offset, limit } = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  const level = analyticsLevel(req);
  const all = await loadEntries(req, f, level);
  res.json({ total: all.length, minutes: all.reduce((s, e) => s + e.minutes, 0), rows: all.slice(offset, offset + limit).map((e) => entryRow(req, e)) });
});

// Workload: capacity vs planned (task estimates spread over their dates) vs tracked, per person.
analyticsRouter.get("/workload", async (req, res) => {
  if (!can(req, "analytics", "all")) throw new HttpError(403, "Workload needs company-wide analytics access");
  const q = z.object({ from: DATE, to: DATE, teamId: z.coerce.number().int().optional() }).parse(req.query);
  const company = req.company!;
  const s = companySettings(company);
  const holidays = new Set((await prisma.holiday.findMany({ where: { companyId: company.id, date: { gte: q.from, lte: q.to } } })).map((h) => h.date));
  const wdays = workingDays(q.from, q.to, company.workWeek, holidays);
  const perDay = company.workWeek.split(",").length || 5;
  const members = await prisma.membership.findMany({ where: { companyId: company.id, user: { status: "ACTIVE" }, ...(q.teamId ? { teamId: q.teamId } : {}) }, include: { user: true, team: true }, orderBy: { user: { name: "asc" } } });
  const ids = members.map((m) => m.userId);
  const leave = await leaveDays(company.id, ids, q.from, q.to, company.workWeek, holidays);
  const tasks = await prisma.task.findMany({
    where: { companyId: company.id, assigneeId: { in: ids }, status: { not: "DONE" }, OR: [{ dueDate: { gte: q.from } }, { dueDate: null, startDate: { lte: q.to } }, { dueDate: { lt: q.from } }] },
    include: { project: { select: { id: true, name: true, color: true } } },
  });
  const tracked = await prisma.timeEntry.groupBy({ by: ["userId"], where: { companyId: company.id, userId: { in: ids }, date: { gte: q.from, lte: q.to }, running: false }, _sum: { minutes: true } });
  const trackedOnTask = await prisma.timeEntry.groupBy({ by: ["taskId"], where: { taskId: { in: tasks.map((t) => t.id) }, running: false }, _sum: { minutes: true } });
  const taskTracked = new Map(trackedOnTask.map((t) => [t.taskId, (t._sum.minutes ?? 0) / 60]));
  const key = s.taskKey;
  const rows = members.map((m) => {
    const lv = leave.get(m.userId) ?? 0;
    const capacity = Math.max(0, wdays - lv) * (m.user.weeklyCapacity / perDay);
    const mine = tasks.filter((t) => t.assigneeId === m.userId).map((t) => {
      const remaining = Math.max(0, (t.estimateHours ?? 0) - (taskTracked.get(t.id) ?? 0));
      // Spread the remaining estimate over the task's working days; overdue work lands in this range.
      const start = t.startDate ?? t.dueDate ?? q.from;
      const end = t.dueDate ?? t.startDate ?? q.to;
      const span = Math.max(1, workingDays(start, end < start ? start : end, company.workWeek, holidays));
      const overlapFrom = start > q.from ? start : q.from, overlapTo = end < q.to ? end : q.to;
      const overdue = !!t.dueDate && t.dueDate < q.from;
      const inRange = overdue ? 1 : overlapFrom <= overlapTo ? workingDays(overlapFrom, overlapTo, company.workWeek, holidays) / span : 0;
      return { id: t.id, key: `${key}-${t.number}`, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate, startDate: t.startDate, estimateHours: t.estimateHours, remainingHours: remaining, plannedHours: remaining * inRange, project: t.project, overdue };
    }).filter((t) => t.plannedHours > 0 || t.overdue || !t.estimateHours);
    const planned = mine.reduce((sum, t) => sum + t.plannedHours, 0);
    const trackedH = (tracked.find((t) => t.userId === m.userId)?._sum.minutes ?? 0) / 60;
    const pct = capacity ? (planned / capacity) * 100 : 0;
    const status = pct > s.overloadPct ? "OVERLOADED" : pct >= s.healthyPct ? "HEALTHY" : pct < s.underPct ? "UNDERUTILIZED" : "OK";
    return {
      user: { id: m.user.id, name: m.user.name, title: m.user.title }, team: m.team?.name ?? null,
      capacityHours: capacity, plannedHours: planned, trackedHours: trackedH, remainingHours: mine.reduce((sum, t) => sum + t.remainingHours, 0),
      leaveDays: lv, utilization: capacity ? trackedH / capacity : null, plannedUtilization: capacity ? planned / capacity : null, status, tasks: mine.sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")),
    };
  });
  res.json({ thresholds: { overloadPct: s.overloadPct, healthyPct: s.healthyPct, underPct: s.underPct }, workingDays: wdays, rows });
});

// Financial view per project, client and person. Employee cost rates stay admin-only.
analyticsRouter.get("/financials", async (req, res) => {
  if (!can(req, "financials", "view")) {
    await audit(req, "access_denied", "financials", null, { new: { path: req.path } });
    throw new HttpError(403, "Financial data is restricted");
  }
  const f = filtersSchema.parse(req.query);
  const entries = await loadEntries(req, f, "all");
  const stats = await projectStats(cid(req));
  const projects = await prisma.project.findMany({ where: { companyId: cid(req), parentId: null }, select: { id: true, name: true, color: true, budget: true, billingType: true, hourlyRate: true, estimatedHours: true, client: { select: { name: true } } } });
  const byProject = aggregate(req, entries, "project", true).map((g) => {
    const p = projects.find((x) => x.id === g.id);
    const s = stats.get(Number(g.id));
    return { ...g, profit: g.revenue! - g.cost!, margin: g.revenue ? (g.revenue - g.cost!) / g.revenue : null, budget: p?.budget ?? null, billingType: p?.billingType, budgetConsumed: s?.budgetConsumed ?? null, budgetRemaining: s?.budgetRemaining ?? null, budgetVariance: p?.budget != null && s?.budgetConsumed != null ? s.budgetConsumed - p.budget : null, hourVariance: s?.hourVariance ?? null };
  });
  const revenue = entries.reduce((s, e) => s + money(e).revenue, 0);
  const cost = entries.reduce((s, e) => s + money(e).cost, 0);
  res.json({
    currency: req.company!.currency,
    totals: { revenue, cost, profit: revenue - cost, margin: revenue ? (revenue - cost) / revenue : null, billableHours: entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0) / 60 },
    byProject, byClient: aggregate(req, entries, "client", true).map((g) => ({ ...g, profit: g.revenue! - g.cost! })),
    byEmployee: req.user!.role === "ADMIN" ? aggregate(req, entries, "employee", true).map((g) => ({ ...g, profit: g.revenue! - g.cost! })) : undefined,
    byMonth: aggregate(req, entries, "month", true),
  });
});

export const isoToday = () => iso(new Date());
