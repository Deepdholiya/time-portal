import { Router, type Request } from "express";
import { z } from "zod";
import { prisma, audit, companySettings } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { assertWeekOpen } from "../weeks.js";
import { DATE } from "../scope.js";

export const timeRouter = Router();

const TIME = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const entrySchema = z.object({
  projectId: z.number().int(),
  taskId: z.number().int().nullish(),
  date: DATE,
  startTime: TIME.nullish(),
  endTime: TIME.nullish(),
  minutes: z.number().int().positive().max(24 * 60).nullish(),
  description: z.string().trim().min(1, "Describe the work you did").max(2000),
  billable: z.boolean().default(true),
  userId: z.number().int().optional(),
});

export const timeInclude = {
  project: { select: { id: true, name: true, color: true, parentId: true, parent: { select: { id: true, name: true, color: true } }, client: { select: { id: true, name: true } } } },
  task: { select: { id: true, number: true, title: true } },
  user: { select: { id: true, name: true } },
} as const;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const snapshot = (e: { date: string; minutes: number; projectId: number; taskId: number | null; description: string; billable: boolean; startTime: string | null; endTime: string | null }) =>
  ({ date: e.date, minutes: e.minutes, projectId: e.projectId, taskId: e.taskId, description: e.description, billable: e.billable, startTime: e.startTime, endTime: e.endTime });

// Who the request acts for: self, or another member when allowed to edit others' time.
function targetUser(req: Request, userId?: number) {
  if (!userId || userId === uid(req)) return uid(req);
  if (!can(req, "editOthersTime", "yes")) throw new HttpError(403, "You can only manage your own time");
  return userId;
}

export async function checkProject(req: Request, userId: number, projectId: number, taskId?: number | null) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: cid(req) } });
  if (!project) throw new HttpError(404, "Project not found");
  if (project.archived) throw new HttpError(400, `${project.name} is archived`);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const member = await prisma.membership.findUnique({ where: { companyId_userId: { companyId: cid(req), userId } } });
  if (!member && user.role !== "ADMIN") throw new HttpError(400, `${user.name} isn't in this company`);
  const ids = await accessibleProjectIds(cid(req), user);
  if (ids !== "all" && !ids.includes(projectId)) throw new HttpError(403, `${user.name} doesn't have access to ${project.name}`);
  if (taskId) {
    const task = await prisma.task.findFirst({ where: { id: taskId, companyId: cid(req) } });
    if (!task || task.projectId !== projectId) throw new HttpError(400, "That task belongs to a different project");
  }
  return project;
}

function resolveMinutes(d: { startTime?: string | null; endTime?: string | null; minutes?: number | null }) {
  if (d.startTime && d.endTime) {
    const m = toMin(d.endTime) - toMin(d.startTime);
    if (m <= 0) throw new HttpError(400, "End time must be after start time");
    return m;
  }
  if (!d.minutes) throw new HttpError(400, "Enter a duration or a start and end time");
  return d.minutes;
}

async function checkOverlap(userId: number, date: string, start?: string | null, end?: string | null, ignoreId?: number) {
  if (!start || !end) return;
  const others = await prisma.timeEntry.findMany({ where: { userId, date, startTime: { not: null }, endTime: { not: null }, running: false, ...(ignoreId ? { id: { not: ignoreId } } : {}) } });
  const s = toMin(start), e = toMin(end);
  const clash = others.find((o) => toMin(o.startTime!) < e && toMin(o.endTime!) > s);
  if (clash) throw new HttpError(409, `Overlaps an entry from ${clash.startTime} to ${clash.endTime}`);
}

async function taskActivity(taskId: number | null | undefined, actorId: number, toValue: string) {
  if (taskId) await prisma.taskActivity.create({ data: { taskId, actorId, action: "time", toValue } });
}

timeRouter.get("/", async (req, res) => {
  const q = z.object({ from: DATE, to: DATE, userId: z.coerce.number().int().optional(), projectId: z.coerce.number().int().optional(), taskId: z.coerce.number().int().optional() }).parse(req.query);
  let userId: number | undefined = uid(req);
  if (q.userId && q.userId !== uid(req)) {
    if (!can(req, "timesheetsView", "all")) throw new HttpError(403, "You can only see your own time");
    userId = q.userId;
  }
  if (q.taskId && !q.userId && can(req, "timesheetsView", "all")) userId = undefined;
  const entries = await prisma.timeEntry.findMany({
    where: { companyId: cid(req), userId, date: { gte: q.from, lte: q.to }, running: false, projectId: q.projectId, taskId: q.taskId },
    include: timeInclude,
    orderBy: [{ date: "desc" }, { startTime: "desc" }, { createdAt: "desc" }],
  });
  res.json(entries);
});

timeRouter.get("/entry/:id", async (req, res) => {
  const e = await prisma.timeEntry.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) }, include: timeInclude });
  if (!e) throw new HttpError(404, "Entry not found");
  if (e.userId !== uid(req) && !can(req, "timesheetsView", "all")) throw new HttpError(403, "You can only see your own time");
  res.json(e);
});

timeRouter.post("/", async (req, res) => {
  const d = entrySchema.parse(req.body);
  const userId = targetUser(req, d.userId);
  await checkProject(req, userId, d.projectId, d.taskId);
  await assertWeekOpen(cid(req), userId, d.date);
  const minutes = resolveMinutes(d);
  await checkOverlap(userId, d.date, d.startTime, d.endTime);
  const entry = await prisma.timeEntry.create({
    data: { companyId: cid(req), userId, projectId: d.projectId, taskId: d.taskId ?? null, date: d.date, startTime: d.startTime ?? null, endTime: d.endTime ?? null, minutes, description: d.description, billable: d.billable },
    include: timeInclude,
  });
  await audit(req, "time_created", "timeEntry", entry.id, { new: { ...snapshot(entry), userId } });
  await taskActivity(entry.taskId, uid(req), `${minutes} min logged`);
  res.status(201).json(entry);
});

async function findEntry(req: Request, id: number) {
  const e = await prisma.timeEntry.findFirst({ where: { id, companyId: cid(req) } });
  if (!e) throw new HttpError(404, "Entry not found");
  targetUser(req, e.userId);
  return e;
}

timeRouter.put("/:id", async (req, res) => {
  const existing = await findEntry(req, Number(req.params.id));
  const d = entrySchema.parse(req.body);
  const reason = z.object({ reason: z.string().max(500).optional() }).parse(req.body).reason;
  await checkProject(req, existing.userId, d.projectId, d.taskId);
  await assertWeekOpen(cid(req), existing.userId, existing.date);
  await assertWeekOpen(cid(req), existing.userId, d.date);
  const minutes = resolveMinutes(d);
  await checkOverlap(existing.userId, d.date, d.startTime, d.endTime, existing.id);
  const entry = await prisma.timeEntry.update({
    where: { id: existing.id },
    data: { projectId: d.projectId, taskId: d.taskId ?? null, date: d.date, startTime: d.startTime ?? null, endTime: d.endTime ?? null, minutes, description: d.description, billable: d.billable },
    include: timeInclude,
  });
  await audit(req, "time_edited", "timeEntry", entry.id, { old: { ...snapshot(existing), userId: existing.userId }, new: snapshot(entry), reason });
  res.json(entry);
});

timeRouter.delete("/:id", async (req, res) => {
  const existing = await findEntry(req, Number(req.params.id));
  await assertWeekOpen(cid(req), existing.userId, existing.date);
  await prisma.timeEntry.delete({ where: { id: existing.id } });
  await audit(req, "time_deleted", "timeEntry", existing.id, { old: { ...snapshot(existing), userId: existing.userId }, reason: typeof req.query.reason === "string" ? req.query.reason : undefined });
  res.json({ ok: true });
});

// Copy entries from source days to target days, e.g. last week onto this week, or selected days.
timeRouter.post("/copy", async (req, res) => {
  const d = z.object({ pairs: z.array(z.tuple([DATE, DATE])).min(1).max(31), userId: z.number().int().optional(), withTimes: z.boolean().default(false) }).parse(req.body);
  const userId = targetUser(req, d.userId);
  let created = 0, skipped = 0;
  for (const [from, to] of d.pairs) {
    await assertWeekOpen(cid(req), userId, to);
    const src = await prisma.timeEntry.findMany({ where: { companyId: cid(req), userId, date: from, running: false } });
    for (const s of src) {
      try {
        await checkProject(req, userId, s.projectId, s.taskId);
        if (d.withTimes) await checkOverlap(userId, to, s.startTime, s.endTime);
        await prisma.timeEntry.create({
          data: { companyId: cid(req), userId, projectId: s.projectId, taskId: s.taskId, date: to, minutes: s.minutes, description: s.description, billable: s.billable, startTime: d.withTimes ? s.startTime : null, endTime: d.withTimes ? s.endTime : null },
        });
        created++;
      } catch { skipped++; }
    }
  }
  await audit(req, "time_copied", "timeEntry", null, { new: { userId, created, skipped, pairs: d.pairs } });
  res.json({ created, skipped });
});

// ---- Timer: one running entry per user unless the company allows overlapping timers ----

const elapsedSec = (e: { accumulatedSec: number; startedAt: Date | null; pausedAt: Date | null }) =>
  e.accumulatedSec + (e.startedAt && !e.pausedAt ? Math.floor((Date.now() - e.startedAt.getTime()) / 1000) : 0);

const withElapsed = <T extends { accumulatedSec: number; startedAt: Date | null; pausedAt: Date | null }>(e: T | null) => (e ? { ...e, elapsedSec: elapsedSec(e) } : null);

async function running(req: Request) {
  return prisma.timeEntry.findFirst({ where: { companyId: cid(req), userId: uid(req), running: true }, include: timeInclude, orderBy: { id: "desc" } });
}

timeRouter.get("/timer", async (req, res) => {
  res.json(withElapsed(await running(req)));
});

const startSchema = z.object({
  projectId: z.number().int().optional(), taskId: z.number().int().nullish(), description: z.string().trim().max(2000).default(""),
  billable: z.boolean().optional(), date: DATE, startTime: TIME,
});

async function startTimer(req: Request, raw: unknown) {
  const d = startSchema.parse(raw);
  let projectId = d.projectId;
  let billable = d.billable;
  let description = d.description;
  // Starting from a task inherits its project, sub-project and billability.
  if (d.taskId) {
    const task = await prisma.task.findFirst({ where: { id: d.taskId, companyId: cid(req) } });
    if (!task) throw new HttpError(404, "Task not found");
    projectId = task.projectId;
    billable ??= task.billable;
    if (!description) description = task.title;
  }
  if (!projectId) throw new HttpError(400, "Pick a project or task first");
  const settings = companySettings(req.company!);
  if (!settings.allowOverlappingTimers && (await running(req))) throw new HttpError(409, "A timer is already running. Stop it or switch to this one.");
  await checkProject(req, uid(req), projectId, d.taskId);
  await assertWeekOpen(cid(req), uid(req), d.date);
  const entry = await prisma.timeEntry.create({
    data: { companyId: cid(req), userId: uid(req), projectId, taskId: d.taskId ?? null, date: d.date, startTime: d.startTime, minutes: 0, description, billable: billable ?? true, running: true, startedAt: new Date() },
    include: timeInclude,
  });
  return withElapsed(entry);
}

async function stopTimer(req: Request, raw: unknown) {
  const d = z.object({ endTime: TIME, description: z.string().trim().max(2000).optional() }).parse(raw);
  const r = await running(req);
  if (!r) throw new HttpError(404, "No timer is running");
  const description = d.description || r.description;
  if (!description) throw new HttpError(400, "Describe the work you did before stopping");
  const sec = elapsedSec(r);
  const minutes = Math.max(1, Math.round(sec / 60));
  // A timer that was paused or crossed midnight keeps its duration; the clock range is dropped when it no longer fits.
  const contiguous = !r.accumulatedSec && toMin(d.endTime) >= toMin(r.startTime!);
  const entry = await prisma.timeEntry.update({
    where: { id: r.id },
    data: { running: false, minutes, description, endTime: contiguous ? d.endTime : null, startTime: contiguous ? r.startTime : null, pausedAt: null, startedAt: null, accumulatedSec: sec },
    include: timeInclude,
  });
  await audit(req, "time_created", "timeEntry", entry.id, { new: { ...snapshot(entry), via: "timer" } });
  await taskActivity(entry.taskId, uid(req), `${minutes} min tracked with timer`);
  return entry;
}

timeRouter.post("/timer/start", async (req, res) => {
  res.status(201).json(await startTimer(req, req.body));
});

timeRouter.post("/timer/pause", async (req, res) => {
  const r = await running(req);
  if (!r) throw new HttpError(404, "No timer is running");
  if (r.pausedAt) return res.json(withElapsed(r));
  const e = await prisma.timeEntry.update({ where: { id: r.id }, data: { pausedAt: new Date(), accumulatedSec: elapsedSec(r) }, include: timeInclude });
  res.json(withElapsed(e));
});

timeRouter.post("/timer/resume", async (req, res) => {
  const r = await running(req);
  if (!r) throw new HttpError(404, "No timer is running");
  if (!r.pausedAt) return res.json(withElapsed(r));
  const e = await prisma.timeEntry.update({ where: { id: r.id }, data: { pausedAt: null, startedAt: new Date() }, include: timeInclude });
  res.json(withElapsed(e));
});

timeRouter.post("/timer/stop", async (req, res) => {
  res.json(await stopTimer(req, req.body));
});

// Stop the current timer and start a new one in one step.
timeRouter.post("/timer/switch", async (req, res) => {
  const d = z.object({ endTime: TIME }).passthrough().parse(req.body);
  const stopped = (await running(req)) ? await stopTimer(req, { endTime: d.endTime }) : null;
  const started = await startTimer(req, req.body);
  res.json({ stopped, started });
});

timeRouter.patch("/timer", async (req, res) => {
  const d = z.object({ description: z.string().max(2000).optional(), billable: z.boolean().optional(), projectId: z.number().int().optional(), taskId: z.number().int().nullish() }).parse(req.body);
  const r = await running(req);
  if (!r) throw new HttpError(404, "No timer is running");
  if (d.projectId) await checkProject(req, uid(req), d.projectId, d.taskId);
  const e = await prisma.timeEntry.update({ where: { id: r.id }, data: d, include: timeInclude });
  res.json(withElapsed(e));
});

timeRouter.delete("/timer/discard", async (req, res) => {
  await prisma.timeEntry.deleteMany({ where: { companyId: cid(req), userId: uid(req), running: true } });
  res.json({ ok: true });
});
