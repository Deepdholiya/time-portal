import { Router, type Request } from "express";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { HttpError } from "../auth.js";

export const analyticsRouter = Router();

const filtersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clientId: z.coerce.number().int().optional(),
  projectId: z.coerce.number().int().optional(),
  subProjectId: z.coerce.number().int().optional(),
  teamId: z.coerce.number().int().optional(),
  userId: z.coerce.number().int().optional(),
  billable: z.enum(["true", "false"]).optional(),
  q: z.string().optional(),
});
type Filters = z.infer<typeof filtersSchema>;

// Builds the time-entry query for the filters, narrowed to the caller's own data when their level is "own".
function buildWhere(f: Filters, scope: string, me: number) {
  const where: Record<string, unknown> = { date: { gte: f.from, lte: f.to }, running: false };
  const user: Record<string, unknown> = {};
  if (scope === "own") where.userId = me;
  else if (f.userId) where.userId = f.userId;
  if (f.teamId) user.teamId = f.teamId;
  if (Object.keys(user).length) where.user = user;
  if (f.subProjectId) where.projectId = f.subProjectId;
  else if (f.projectId) where.OR = [{ projectId: f.projectId }, { project: { parentId: f.projectId } }];
  if (f.clientId) where.AND = [{ OR: [{ project: { clientId: f.clientId } }, { project: { parent: { clientId: f.clientId } } }] }];
  if (f.billable) where.billable = f.billable === "true";
  if (f.q) where.description = { contains: f.q };
  return where;
}

async function loadEntries(req: Request, scopeFeature: "analytics" | "export") {
  const scope = req.perms![scopeFeature];
  if (scope === "none") throw new HttpError(403, "You don't have access to this");
  const f = filtersSchema.parse(req.query);
  const entries = await prisma.timeEntry.findMany({
    where: buildWhere(f, scope, req.user!.id),
    include: {
      user: { select: { id: true, name: true, weeklyCapacity: true, team: { select: { id: true, name: true } } } },
      project: { select: { id: true, name: true, color: true, estimatedHours: true, parent: { select: { id: true, name: true, color: true, estimatedHours: true } }, client: { select: { id: true, name: true } } } },
      task: { select: { id: true, title: true } },
    },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  });
  return { f, scope, entries };
}

type Entry = Awaited<ReturnType<typeof loadEntries>>["entries"][number];
const topProject = (e: Entry) => e.project.parent ?? e.project;

function group<K extends string | number>(entries: Entry[], key: (e: Entry) => K, meta: (e: Entry) => Record<string, unknown>) {
  const map = new Map<K, { key: K; minutes: number; billableMinutes: number; entries: number } & Record<string, unknown>>();
  for (const e of entries) {
    const k = key(e);
    let g = map.get(k);
    if (!g) { g = { key: k, minutes: 0, billableMinutes: 0, entries: 0, ...meta(e) }; map.set(k, g); }
    g.minutes += e.minutes;
    if (e.billable) g.billableMinutes += e.minutes;
    g.entries += 1;
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

function workdaysBetween(from: string, to: string) {
  let n = 0;
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

analyticsRouter.get("/", async (req, res) => {
  const { f, scope, entries } = await loadEntries(req, "analytics");
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const billable = entries.reduce((s, e) => s + (e.billable ? e.minutes : 0), 0);

  const byEmployee = group(entries, (e) => e.user.id, (e) => ({ name: e.user.name, team: e.user.team?.name ?? null, weeklyCapacity: e.user.weeklyCapacity }));
  // Capacity only counts weekdays up to today, so a half-finished month isn't judged against the full month.
  const todayIso = new Date().toISOString().slice(0, 10);
  const workdays = f.from > todayIso ? 0 : workdaysBetween(f.from, f.to < todayIso ? f.to : todayIso);
  for (const g of byEmployee) {
    const capacityMin = ((g.weeklyCapacity as number) / 5) * workdays * 60;
    g.capacityMinutes = Math.round(capacityMin);
    g.utilization = capacityMin ? g.minutes / capacityMin : null;
    g.projects = new Set(entries.filter((e) => e.user.id === g.key).map((e) => topProject(e).id)).size;
  }

  const byProject = group(entries, (e) => topProject(e).id, (e) => ({ name: topProject(e).name, color: topProject(e).color, client: e.project.client?.name ?? null, estimatedHours: topProject(e).estimatedHours }));
  const bySubProject = group(entries, (e) => e.project.id, (e) => ({ name: e.project.name, color: e.project.color, parent: e.project.parent?.name ?? null, estimatedHours: e.project.estimatedHours }));
  const byDay = group(entries, (e) => e.date, () => ({})).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const byTask = group(entries.filter((e) => e.task), (e) => e.task!.id, (e) => ({ name: e.task!.title, project: e.project.name })).slice(0, 15);

  // Project × employee matrix for the "who worked on what" view.
  const matrix = group(entries, (e) => `${topProject(e).id}:${e.user.id}`, (e) => ({ projectId: topProject(e).id, project: topProject(e).name, userId: e.user.id, user: e.user.name }));

  res.json({
    scope,
    kpis: {
      totalMinutes: total,
      billableMinutes: billable,
      entries: entries.length,
      people: byEmployee.length,
      projects: byProject.length,
      utilization: (() => {
        const cap = byEmployee.reduce((s, g) => s + (g.capacityMinutes as number), 0);
        return cap ? total / cap : null;
      })(),
    },
    byEmployee, byProject, bySubProject, byDay, byTask, matrix,
    entries: entries.slice(0, 500).map((e) => ({
      id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, minutes: e.minutes, description: e.description, billable: e.billable,
      user: { id: e.user.id, name: e.user.name },
      project: topProject(e).name, projectColor: topProject(e).color,
      subProject: e.project.parent ? e.project.name : null,
      task: e.task?.title ?? null, client: e.project.client?.name ?? null,
    })),
    truncated: entries.length > 500,
  });
});

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

analyticsRouter.get("/export.csv", async (req, res) => {
  const { f, entries } = await loadEntries(req, "export");
  const header = ["Date", "Start", "End", "Hours", "Employee", "Team", "Client", "Project", "Sub-project", "Task", "Description", "Billable"];
  const rows = entries.map((e) => [
    e.date, e.startTime, e.endTime, (e.minutes / 60).toFixed(2), e.user.name, e.user.team?.name, e.project.client?.name,
    topProject(e).name, e.project.parent ? e.project.name : "", e.task?.title, e.description, e.billable ? "Yes" : "No",
  ]);
  await audit(req.user!.id, "export_generated", "timeEntry", null, { filters: f, rows: rows.length });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="time-report-${f.from}-to-${f.to}.csv"`);
  res.send("﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"));
});
