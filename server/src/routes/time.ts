import { Router, type Request } from "express";
import { z } from "zod";
import { prisma, audit, companySettings } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { assertDayOpen } from "../days.js";
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
  // Descriptions can be added later; the company's rules are checked when the day is submitted.
  description: z.string().trim().max(2000).default(""),
  billable: z.boolean().default(true),
  tagIds: z.array(z.number().int()).max(20).optional(),
  userId: z.number().int().optional(),
});

export const timeInclude = {
  project: { select: { id: true, name: true, color: true, parentId: true, parent: { select: { id: true, name: true, color: true } }, client: { select: { id: true, name: true } } } },
  task: { select: { id: true, number: true, title: true } },
  user: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
} as const;

/** Entries come back with their tags as a plain list. */
export const flatTags = <T extends { tags: { tag: { id: number; name: string; color: string } }[] }>(e: T) => ({ ...e, tags: e.tags.map((t) => t.tag) });

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

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Works out start, end and duration from what was entered: start + end gives the duration, a duration gives the end.
 * A duration without a start begins where the day's last entry ends, or at the start of the working day.
 */
async function resolveTimes(company: { settings: string }, userId: number, d: { date: string; startTime?: string | null; endTime?: string | null; minutes?: number | null }, ignoreId?: number) {
  let start = d.startTime ?? null;
  if (start && d.endTime && !d.minutes) {
    const m = toMin(d.endTime) - toMin(start);
    if (m <= 0) throw new HttpError(400, "End time must be after start time");
    return { startTime: start, endTime: d.endTime, minutes: m };
  }
  if (!d.minutes) throw new HttpError(400, "Enter a duration, or a start and end time");
  if (!start) {
    const last = await prisma.timeEntry.findFirst({ where: { userId, date: d.date, endTime: { not: null }, running: false, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, orderBy: { endTime: "desc" } });
    start = last?.endTime ?? companySettings(company).workdayStart;
  }
  const end = toMin(start) + d.minutes;
  if (end > 24 * 60) {
    if (d.startTime) throw new HttpError(400, `Starting at ${start}, ${Math.floor(d.minutes / 60)}h ${d.minutes % 60}m runs past midnight. Pick an earlier start or a shorter duration.`);
    // No room left after the day's last entry: keep the duration without clock times.
    return { startTime: null, endTime: null, minutes: d.minutes };
  }
  return { startTime: start, endTime: toTime(end), minutes: d.minutes };
}

/** Tags must be active and allowed for the person's team. */
async function checkTags(companyId: number, userId: number, tagIds?: number[]) {
  if (!tagIds?.length) return [];
  const ids = [...new Set(tagIds)];
  const member = await prisma.membership.findUnique({ where: { companyId_userId: { companyId, userId } } });
  const tags = await prisma.tag.findMany({ where: { companyId, id: { in: ids } } });
  if (tags.length !== ids.length) throw new HttpError(400, "One of the tags doesn't exist");
  for (const t of tags) {
    if (!t.active) throw new HttpError(400, `The tag "${t.name}" is no longer in use`);
    const teams = JSON.parse(t.teamIds || "[]") as number[];
    if (teams.length && (!member?.teamId || !teams.includes(member.teamId))) throw new HttpError(403, `The tag "${t.name}" isn't available for your team`);
  }
  return ids;
}

async function checkOverlap(company: { settings: string }, userId: number, date: string, start?: string | null, end?: string | null, ignoreId?: number) {
  if (!start || !end || companySettings(company).allowOverlappingTimers) return;
  const others = await prisma.timeEntry.findMany({ where: { userId, date, startTime: { not: null }, endTime: { not: null }, running: false, ...(ignoreId ? { id: { not: ignoreId } } : {}) } });
  const s = toMin(start), e = toMin(end);
  const clash = others.find((o) => toMin(o.startTime!) < e && toMin(o.endTime!) > s);
  if (clash) throw new HttpError(409, `${start}–${end} overlaps your entry from ${clash.startTime} to ${clash.endTime}`);
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
  res.json(entries.map(flatTags));
});

timeRouter.get("/entry/:id", async (req, res) => {
  const e = await prisma.timeEntry.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) }, include: timeInclude });
  if (!e) throw new HttpError(404, "Entry not found");
  if (e.userId !== uid(req) && !can(req, "timesheetsView", "all")) throw new HttpError(403, "You can only see your own time");
  res.json(flatTags(e));
});

timeRouter.post("/", async (req, res) => {
  const d = entrySchema.parse(req.body);
  const userId = targetUser(req, d.userId);
  await checkProject(req, userId, d.projectId, d.taskId);
  await assertDayOpen(req.company!, userId, d.date);
  const tagIds = await checkTags(cid(req), userId, d.tagIds);
  const t = await resolveTimes(req.company!, userId, d);
  await checkOverlap(req.company!, userId, d.date, t.startTime, t.endTime);
  const entry = await prisma.timeEntry.create({
    data: { companyId: cid(req), userId, projectId: d.projectId, taskId: d.taskId ?? null, date: d.date, ...t, description: d.description, billable: d.billable, tags: { create: tagIds.map((tagId) => ({ tagId })) } },
    include: timeInclude,
  });
  await audit(req, "time_created", "timeEntry", entry.id, { new: { ...snapshot(entry), userId, tagIds } });
  await taskActivity(entry.taskId, uid(req), `${t.minutes} min logged`);
  res.status(201).json(flatTags(entry));
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
  await assertDayOpen(req.company!, existing.userId, existing.date);
  await assertDayOpen(req.company!, existing.userId, d.date);
  const oldTags = (await prisma.timeEntryTag.findMany({ where: { entryId: existing.id } })).map((t) => t.tagId);
  // Tags that were already on the entry stay valid even if they were since limited to other teams.
  const tagIds = d.tagIds === undefined ? oldTags : [...oldTags.filter((t) => d.tagIds!.includes(t)), ...(await checkTags(cid(req), existing.userId, d.tagIds.filter((t) => !oldTags.includes(t))))];
  const t = await resolveTimes(req.company!, existing.userId, d, existing.id);
  await checkOverlap(req.company!, existing.userId, d.date, t.startTime, t.endTime, existing.id);
  const entry = await prisma.timeEntry.update({
    where: { id: existing.id },
    data: { projectId: d.projectId, taskId: d.taskId ?? null, date: d.date, ...t, description: d.description, billable: d.billable, tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } },
    include: timeInclude,
  });
  await audit(req, "time_edited", "timeEntry", entry.id, { old: { ...snapshot(existing), userId: existing.userId, tagIds: oldTags }, new: { ...snapshot(entry), tagIds }, reason });
  res.json(flatTags(entry));
});

timeRouter.delete("/:id", async (req, res) => {
  const existing = await findEntry(req, Number(req.params.id));
  await assertDayOpen(req.company!, existing.userId, existing.date);
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
    await assertDayOpen(req.company!, userId, to);
    const src = await prisma.timeEntry.findMany({ where: { companyId: cid(req), userId, date: from, running: false } });
    for (const s of src) {
      try {
        await checkProject(req, userId, s.projectId, s.taskId);
        const t = d.withTimes && s.startTime && s.endTime ? { startTime: s.startTime, endTime: s.endTime, minutes: s.minutes } : await resolveTimes(req.company!, userId, { date: to, minutes: s.minutes });
        await checkOverlap(req.company!, userId, to, t.startTime, t.endTime);
        const tags = await prisma.timeEntryTag.findMany({ where: { entryId: s.id } });
        await prisma.timeEntry.create({
          data: { companyId: cid(req), userId, projectId: s.projectId, taskId: s.taskId, date: to, ...t, description: s.description, billable: s.billable, tags: { create: tags.map((x) => ({ tagId: x.tagId })) } },
        });
        created++;
      } catch { skipped++; }
    }
  }
  await audit(req, "time_copied", "timeEntry", null, { new: { userId, created, skipped, pairs: d.pairs } });
  res.json({ created, skipped });
});
