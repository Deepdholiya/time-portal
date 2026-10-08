import { Router, type Request } from "express";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { HttpError } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { assertWeekOpen } from "../weeks.js";

export const timeRouter = Router();

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

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

const include = {
  project: { select: { id: true, name: true, color: true, parentId: true, parent: { select: { id: true, name: true, color: true } } } },
  task: { select: { id: true, title: true } },
  user: { select: { id: true, name: true } },
} as const;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// Who the request is acting for: self, or another user when allowed to edit others' time.
function targetUser(req: Request, userId?: number) {
  if (!userId || userId === req.user!.id) return req.user!.id;
  if (req.perms!.editOthersTime !== "yes") throw new HttpError(403, "You can only manage your own time");
  return userId;
}

async function checkProject(userId: number, projectId: number, taskId?: number | null) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.status === "ARCHIVED") throw new HttpError(400, "Pick an active project");
  const ids = await accessibleProjectIds(user);
  if (ids !== "all" && !ids.includes(projectId)) throw new HttpError(403, `${user.name} doesn't have access to ${project.name}`);
  if (taskId) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.projectId !== projectId) throw new HttpError(400, "That task belongs to a different project");
  }
}

function resolveMinutes(d: z.infer<typeof entrySchema>) {
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

timeRouter.get("/", async (req, res) => {
  const q = z.object({ from: DATE, to: DATE, userId: z.coerce.number().int().optional() }).parse(req.query);
  const userId = targetUser(req, q.userId);
  const entries = await prisma.timeEntry.findMany({
    where: { userId, date: { gte: q.from, lte: q.to }, running: false },
    include,
    orderBy: [{ date: "desc" }, { startTime: "desc" }, { createdAt: "desc" }],
  });
  res.json(entries);
});

timeRouter.post("/", async (req, res) => {
  const d = entrySchema.parse(req.body);
  const userId = targetUser(req, d.userId);
  await checkProject(userId, d.projectId, d.taskId);
  await assertWeekOpen(userId, d.date);
  const minutes = resolveMinutes(d);
  await checkOverlap(userId, d.date, d.startTime, d.endTime);
  const entry = await prisma.timeEntry.create({
    data: { userId, projectId: d.projectId, taskId: d.taskId ?? null, date: d.date, startTime: d.startTime ?? null, endTime: d.endTime ?? null, minutes, description: d.description, billable: d.billable },
    include,
  });
  await audit(req.user!.id, "time_created", "timeEntry", entry.id, { userId, minutes, projectId: d.projectId });
  res.status(201).json(entry);
});

timeRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Entry not found");
  targetUser(req, existing.userId);
  const d = entrySchema.parse(req.body);
  await checkProject(existing.userId, d.projectId, d.taskId);
  await assertWeekOpen(existing.userId, existing.date);
  await assertWeekOpen(existing.userId, d.date);
  const minutes = resolveMinutes(d);
  await checkOverlap(existing.userId, d.date, d.startTime, d.endTime, id);
  const entry = await prisma.timeEntry.update({
    where: { id },
    data: { projectId: d.projectId, taskId: d.taskId ?? null, date: d.date, startTime: d.startTime ?? null, endTime: d.endTime ?? null, minutes, description: d.description, billable: d.billable },
    include,
  });
  await audit(req.user!.id, "time_edited", "timeEntry", id, { before: { minutes: existing.minutes, projectId: existing.projectId }, after: { minutes, projectId: d.projectId } });
  res.json(entry);
});

timeRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Entry not found");
  targetUser(req, existing.userId);
  await assertWeekOpen(existing.userId, existing.date);
  await prisma.timeEntry.delete({ where: { id } });
  await audit(req.user!.id, "time_deleted", "timeEntry", id, { userId: existing.userId, minutes: existing.minutes, date: existing.date });
  res.json({ ok: true });
});

// ---- Timer: one running entry per user ----

timeRouter.get("/timer", async (req, res) => {
  const running = await prisma.timeEntry.findFirst({ where: { userId: req.user!.id, running: true }, include });
  res.json(running);
});

timeRouter.post("/timer/start", async (req, res) => {
  const d = z.object({
    projectId: z.number().int(), taskId: z.number().int().nullish(), description: z.string().trim().max(2000).default(""),
    billable: z.boolean().default(true), date: DATE, startTime: TIME,
  }).parse(req.body);
  const userId = req.user!.id;
  if (await prisma.timeEntry.findFirst({ where: { userId, running: true } })) throw new HttpError(409, "A timer is already running");
  await checkProject(userId, d.projectId, d.taskId);
  await assertWeekOpen(userId, d.date);
  const entry = await prisma.timeEntry.create({
    data: { userId, projectId: d.projectId, taskId: d.taskId ?? null, date: d.date, startTime: d.startTime, minutes: 0, description: d.description, billable: d.billable, running: true, startedAt: new Date() },
    include,
  });
  res.status(201).json(entry);
});

timeRouter.post("/timer/stop", async (req, res) => {
  const d = z.object({ endTime: TIME, description: z.string().trim().max(2000).optional() }).parse(req.body);
  const running = await prisma.timeEntry.findFirst({ where: { userId: req.user!.id, running: true } });
  if (!running) throw new HttpError(404, "No timer is running");
  const description = d.description ?? running.description;
  if (!description) throw new HttpError(400, "Describe the work you did before stopping");
  const minutes = Math.max(1, Math.round((Date.now() - running.startedAt!.getTime()) / 60000));
  // Timers that cross midnight keep their start date and duration; the clock range is dropped.
  const sameDay = toMin(d.endTime) >= toMin(running.startTime!);
  const entry = await prisma.timeEntry.update({
    where: { id: running.id },
    data: { running: false, minutes, description, endTime: sameDay ? d.endTime : null, startTime: sameDay ? running.startTime : null },
    include,
  });
  await audit(req.user!.id, "time_created", "timeEntry", entry.id, { minutes, projectId: entry.projectId, via: "timer" });
  res.json(entry);
});

timeRouter.delete("/timer/discard", async (req, res) => {
  await prisma.timeEntry.deleteMany({ where: { userId: req.user!.id, running: true } });
  res.json({ ok: true });
});
