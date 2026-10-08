import { Router, type Request } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, audit, notify, parseJson, companySettings } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { DATE } from "../scope.js";
import { timeInclude } from "./time.js";
import { onTaskStatus } from "../jobs.js";
import { PRIORITIES, STATUSES, dependencyImpact, nextNumber, nextOccurrence, serializeTasks, shiftDependents, taskListInclude, wouldCycle } from "../tasks.js";

export const tasksRouter = Router();

export const UPLOAD_DIR = path.resolve(import.meta.dirname, "../../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/(plain|csv|markdown)|application\/(zip|json)|application\/vnd\.openxmlformats-officedocument\.[\w.]+|application\/msword|application\/vnd\.ms-excel)$/;
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (_r, _f, cb) => cb(null, crypto.randomBytes(16).toString("hex")) }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_r, file, cb) => (ALLOWED.test(file.mimetype) ? cb(null, true) : cb(new HttpError(400, `${file.originalname}: that file type isn't allowed`))),
});

const manage = (req: Request) => can(req, "tasks", "manage");

async function projectScope(req: Request) {
  return accessibleProjectIds(cid(req), req.user!, req.perms);
}

// Tasks visible to this user: in a project they can access, or assigned to them.
async function visibleWhere(req: Request): Promise<Prisma.TaskWhereInput> {
  const ids = await projectScope(req);
  if (ids === "all") return { companyId: cid(req) };
  return { companyId: cid(req), OR: [{ projectId: { in: ids } }, { assigneeId: uid(req) }] };
}

async function getTask(req: Request, id: number) {
  const t = await prisma.task.findFirst({ where: { AND: [{ id }, await visibleWhere(req)] } });
  if (!t) throw new HttpError(404, "Task not found");
  return t;
}

const ownsTask = (req: Request, t: { assigneeId: number | null; creatorId: number | null }) => t.assigneeId === uid(req) || t.creatorId === uid(req);

const listQuery = z.object({
  projectId: z.coerce.number().int().optional(),
  assigneeId: z.string().optional(), // id list or "me" or "none"
  status: z.string().optional(), priority: z.string().optional(),
  milestoneId: z.coerce.number().int().optional(), section: z.string().optional(), tag: z.string().optional(),
  q: z.string().optional(), dueFrom: DATE.optional(), dueTo: DATE.optional(),
  parent: z.enum(["top", "all"]).default("top"), parentId: z.coerce.number().int().optional(),
  includeDone: z.enum(["true", "false"]).default("true"),
  limit: z.coerce.number().int().max(2000).default(1000),
});

tasksRouter.get("/", async (req, res) => {
  const q = listQuery.parse(req.query);
  const and: Prisma.TaskWhereInput[] = [await visibleWhere(req)];
  if (q.projectId) and.push({ OR: [{ projectId: q.projectId }, { project: { parentId: q.projectId } }] });
  if (q.assigneeId === "me") and.push({ assigneeId: uid(req) });
  else if (q.assigneeId === "none") and.push({ assigneeId: null });
  else if (q.assigneeId) and.push({ assigneeId: { in: q.assigneeId.split(",").map(Number) } });
  if (q.status) and.push({ status: { in: q.status.split(",") } });
  if (q.priority) and.push({ priority: { in: q.priority.split(",") } });
  if (q.milestoneId) and.push({ milestoneId: q.milestoneId });
  if (q.section) and.push({ section: q.section });
  if (q.tag) and.push({ tags: { contains: `"${q.tag}"` } });
  if (q.q) and.push({ OR: [{ title: { contains: q.q } }, { description: { contains: q.q } }] });
  if (q.dueFrom || q.dueTo) and.push({ OR: [{ dueDate: { gte: q.dueFrom ?? "0000", lte: q.dueTo ?? "9999" } }, { startDate: { gte: q.dueFrom ?? "0000", lte: q.dueTo ?? "9999" } }] });
  if (q.parentId) and.push({ parentId: q.parentId });
  else if (q.parent === "top") and.push({ parentId: null });
  if (q.includeDone === "false") and.push({ status: { not: "DONE" } });
  const tasks = await prisma.task.findMany({ where: { AND: and }, include: taskListInclude, orderBy: [{ sortOrder: "asc" }, { number: "desc" }], take: q.limit });
  res.json(await serializeTasks(cid(req), tasks));
});

tasksRouter.get("/:id", async (req, res) => {
  const t = await getTask(req, Number(req.params.id));
  const full = await prisma.task.findUniqueOrThrow({
    where: { id: t.id },
    include: {
      ...taskListInclude,
      creator: { select: { id: true, name: true } },
      parent: { select: { id: true, number: true, title: true } },
      blocking: { select: { blocked: { select: { id: true, number: true, title: true, status: true, startDate: true, dueDate: true } } } },
      followers: { select: { user: { select: { id: true, name: true } } } },
      comments: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      attachments: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      activity: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  const [base] = await serializeTasks(cid(req), [full]);
  const subtasks = await serializeTasks(cid(req), await prisma.task.findMany({ where: { parentId: t.id }, include: taskListInclude, orderBy: [{ sortOrder: "asc" }, { number: "asc" }] }));
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: full.activity.map((a) => a.actorId).filter((x): x is number => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const key = companySettings(req.company!).taskKey;
  const entries = await prisma.timeEntry.findMany({
    where: { taskId: t.id, running: false, ...(can(req, "timesheetsView", "all") ? {} : { userId: uid(req) }) },
    include: timeInclude, orderBy: { date: "desc" }, take: 50,
  });
  res.json({
    ...base,
    description: full.description,
    creator: full.creator,
    parent: full.parent ? { ...full.parent, key: `${key}-${full.parent.number}` } : null,
    blocking: full.blocking.map((b) => ({ ...b.blocked, key: `${key}-${b.blocked.number}` })),
    followers: full.followers.map((f) => f.user),
    comments: full.comments.map((c) => ({ ...c, mentions: parseJson<number[]>(c.mentions, []) })),
    attachments: full.attachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, user: a.user, createdAt: a.createdAt })),
    activity: full.activity.map((a) => ({ ...a, actor: a.actorId ? actors.get(a.actorId) ?? null : null })),
    subtasks, timeEntries: entries,
    canEdit: manage(req) || ownsTask(req, full),
    canManage: manage(req),
  });
});

const fields = {
  title: z.string().trim().min(1, "Give the task a name").max(300),
  description: z.string().max(20000).nullable(),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  section: z.string().trim().max(100).nullable(),
  sortOrder: z.number(),
  startDate: DATE.nullable(),
  dueDate: DATE.nullable(),
  estimateHours: z.number().min(0).max(10000).nullable(),
  billable: z.boolean(),
  tags: z.array(z.string().trim().max(40)).max(20),
  customFields: z.record(z.string(), z.unknown()),
  recurrence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).nullable(),
  projectId: z.number().int(),
  parentId: z.number().int().nullable(),
  milestoneId: z.number().int().nullable(),
  assigneeId: z.number().int().nullable(),
};
const createSchema = z.object(fields).partial().required({ title: true, projectId: true });
const updateSchema = z.object(fields).partial();
// What someone with "own" or "create" task access may change on their own tasks.
const EMPLOYEE_FIELDS = new Set(["title", "description", "status", "priority", "section", "sortOrder", "tags", "customFields"]);

async function checkRefs(req: Request, d: { projectId?: number; parentId?: number | null; milestoneId?: number | null; assigneeId?: number | null }) {
  if (d.projectId !== undefined) {
    const ids = await projectScope(req);
    const p = await prisma.project.findFirst({ where: { id: d.projectId, companyId: cid(req) } });
    if (!p || (ids !== "all" && !ids.includes(p.id))) throw new HttpError(403, "You don't have access to that project");
  }
  if (d.parentId) {
    const parent = await prisma.task.findFirst({ where: { id: d.parentId, companyId: cid(req) } });
    if (!parent) throw new HttpError(400, "Parent task not found");
  }
  if (d.milestoneId) {
    const m = await prisma.milestone.findFirst({ where: { id: d.milestoneId, project: { companyId: cid(req) } } });
    if (!m) throw new HttpError(400, "Milestone not found");
  }
  if (d.assigneeId) {
    const m = await prisma.membership.findUnique({ where: { companyId_userId: { companyId: cid(req), userId: d.assigneeId } } });
    if (!m) throw new HttpError(400, "That person isn't in this company");
  }
}

const toData = (d: z.infer<typeof updateSchema>) => {
  const { tags, customFields, ...rest } = d;
  return { ...rest, ...(tags ? { tags: JSON.stringify(tags) } : {}), ...(customFields ? { customFields: JSON.stringify(customFields) } : {}) };
};

async function followersOf(taskId: number) {
  return (await prisma.taskFollower.findMany({ where: { taskId }, select: { userId: true } })).map((f) => f.userId);
}

export async function createTask(req: Request, d: z.infer<typeof createSchema>) {
  if (!can(req, "tasks", "create")) throw new HttpError(403, "You can't create tasks");
  if (!manage(req) && d.assigneeId && d.assigneeId !== uid(req)) throw new HttpError(403, "You can only assign tasks to yourself");
  await checkRefs(req, d);
  const number = await nextNumber(cid(req));
  const task = await prisma.task.create({
    data: { ...toData(d), title: d.title, projectId: d.projectId, companyId: cid(req), number, creatorId: uid(req), assigneeId: d.assigneeId ?? (manage(req) ? null : uid(req)) } as Prisma.TaskUncheckedCreateInput,
  });
  await prisma.taskFollower.create({ data: { taskId: task.id, userId: uid(req) } });
  await prisma.taskActivity.create({ data: { taskId: task.id, actorId: uid(req), action: "created" } });
  if (task.assigneeId && task.assigneeId !== uid(req)) {
    await prisma.taskFollower.upsert({ where: { taskId_userId: { taskId: task.id, userId: task.assigneeId } }, update: {}, create: { taskId: task.id, userId: task.assigneeId } });
    await notify([task.assigneeId], { companyId: cid(req), type: "TASK_ASSIGNED", title: `${req.user!.name} assigned you "${task.title}"`, link: `/tasks/${task.id}` });
  }
  await audit(req, "task_created", "task", task.id, { new: { title: task.title, projectId: task.projectId, assigneeId: task.assigneeId } });
  return task;
}

tasksRouter.post("/", async (req, res) => {
  const task = await createTask(req, createSchema.parse(req.body));
  const [out] = await serializeTasks(cid(req), [await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: taskListInclude })]);
  res.status(201).json(out);
});

async function applyUpdate(req: Request, id: number, d: z.infer<typeof updateSchema>) {
  const t = await getTask(req, id);
  if (!manage(req)) {
    if (!ownsTask(req, t)) throw new HttpError(403, "You can only update tasks assigned to you");
    const blocked = Object.keys(d).filter((k) => !EMPLOYEE_FIELDS.has(k));
    if (blocked.length) throw new HttpError(403, `You can't change ${blocked.join(", ")} on this task`);
  }
  await checkRefs(req, d);
  if (d.parentId === id) throw new HttpError(400, "A task can't be its own parent");
  const data: Record<string, unknown> = toData(d);
  if (d.status === "DONE" && t.status !== "DONE") data.completedAt = new Date();
  if (d.status && d.status !== "DONE") data.completedAt = null;
  const updated = await prisma.task.update({ where: { id }, data });

  const changed: string[] = [];
  for (const k of Object.keys(d) as (keyof typeof d)[]) {
    const before = (t as Record<string, unknown>)[k];
    const after = (updated as Record<string, unknown>)[k];
    if (String(before ?? "") === String(after ?? "") || k === "sortOrder") continue;
    changed.push(k);
    await prisma.taskActivity.create({ data: { taskId: id, actorId: uid(req), action: "field", field: k, fromValue: before == null ? null : String(before).slice(0, 500), toValue: after == null ? null : String(after).slice(0, 500) } });
  }
  if (changed.length) await audit(req, "task_updated", "task", id, { old: Object.fromEntries(changed.map((k) => [k, (t as Record<string, unknown>)[k]])), new: Object.fromEntries(changed.map((k) => [k, (updated as Record<string, unknown>)[k]])) });

  if (changed.includes("assigneeId") && updated.assigneeId && updated.assigneeId !== uid(req)) {
    await prisma.taskFollower.upsert({ where: { taskId_userId: { taskId: id, userId: updated.assigneeId } }, update: {}, create: { taskId: id, userId: updated.assigneeId } });
    await notify([updated.assigneeId], { companyId: cid(req), type: "TASK_ASSIGNED", title: `${req.user!.name} assigned you "${updated.title}"`, link: `/tasks/${id}` });
  }
  if (changed.includes("status")) {
    await onTaskStatus(cid(req), updated, uid(req));
    const others = (await followersOf(id)).filter((u) => u !== uid(req));
    await notify(others, { companyId: cid(req), type: "TASK_STATUS", title: `"${updated.title}" moved to ${updated.status.replace("_", " ").toLowerCase()}`, body: `by ${req.user!.name}`, link: `/tasks/${id}` });
    // Done tasks that blocked others: tell the blocked tasks' assignees they can start.
    if (updated.status === "DONE") {
      const unblocked = await prisma.taskDependency.findMany({ where: { blockerId: id }, include: { blocked: true } });
      await notify(unblocked.map((u) => u.blocked.assigneeId), { companyId: cid(req), type: "DEPENDENCY_CLEARED", title: `"${updated.title}" is done, so "${unblocked[0]?.blocked.title}" can start`, link: `/tasks/${unblocked[0]?.blocked.id}` });
    }
    // Recurring tasks create their next occurrence when completed.
    if (updated.status === "DONE" && updated.recurrence) {
      const number = await nextNumber(cid(req));
      await prisma.task.create({
        data: {
          companyId: cid(req), number, title: updated.title, description: updated.description, priority: updated.priority, section: updated.section, projectId: updated.projectId,
          milestoneId: updated.milestoneId, assigneeId: updated.assigneeId, creatorId: uid(req), estimateHours: updated.estimateHours, billable: updated.billable,
          tags: updated.tags, customFields: updated.customFields, recurrence: updated.recurrence, status: "TODO",
          startDate: nextOccurrence(updated.startDate, updated.recurrence), dueDate: nextOccurrence(updated.dueDate, updated.recurrence),
        },
      });
    }
  }
  if (changed.includes("status") && updated.status === "BLOCKED") {
    await notify([updated.creatorId, ...(await followersOf(id))].filter((u) => u !== uid(req)), { companyId: cid(req), type: "DEPENDENCY_BLOCKED", title: `"${updated.title}" is blocked`, link: `/tasks/${id}` });
  }
  const impact = changed.some((k) => k === "dueDate" || k === "startDate") ? await dependencyImpact(cid(req), id) : [];
  return { updated, impact };
}

tasksRouter.patch("/:id", async (req, res) => {
  const { updated, impact } = await applyUpdate(req, Number(req.params.id), updateSchema.parse(req.body));
  const [out] = await serializeTasks(cid(req), [await prisma.task.findUniqueOrThrow({ where: { id: updated.id }, include: taskListInclude })]);
  res.json({ ...out, impact });
});

tasksRouter.post("/bulk", async (req, res) => {
  const d = z.object({ ids: z.array(z.number().int()).min(1).max(500), patch: updateSchema.optional(), delete: z.boolean().optional() }).parse(req.body);
  if (!manage(req)) throw new HttpError(403, "Bulk changes need task management access");
  let done = 0;
  for (const id of d.ids) {
    if (d.delete) {
      const t = await getTask(req, id);
      await prisma.task.delete({ where: { id: t.id } });
      await audit(req, "task_deleted", "task", t.id, { old: { title: t.title } });
    } else if (d.patch) await applyUpdate(req, id, d.patch);
    done++;
  }
  res.json({ updated: done });
});

tasksRouter.delete("/:id", async (req, res) => {
  const t = await getTask(req, Number(req.params.id));
  if (!manage(req) && t.creatorId !== uid(req)) throw new HttpError(403, "You can only delete tasks you created");
  await prisma.task.delete({ where: { id: t.id } });
  await audit(req, "task_deleted", "task", t.id, { old: { title: t.title, projectId: t.projectId } });
  res.json({ ok: true });
});

tasksRouter.get("/:id/impact", async (req, res) => {
  const t = await getTask(req, Number(req.params.id));
  res.json(await dependencyImpact(cid(req), t.id));
});

tasksRouter.post("/:id/shift-dependents", async (req, res) => {
  if (!manage(req)) throw new HttpError(403, "You can't reschedule other tasks");
  const t = await getTask(req, Number(req.params.id));
  const moved = await shiftDependents(t.id);
  await audit(req, "tasks_rescheduled", "task", t.id, { new: { moved } });
  res.json({ moved: moved.length });
});

// ---- Dependencies ----
tasksRouter.post("/:id/dependencies", async (req, res) => {
  if (!manage(req)) throw new HttpError(403, "You can't change dependencies");
  const t = await getTask(req, Number(req.params.id));
  const d = z.object({ blockerId: z.number().int().optional(), blockedId: z.number().int().optional() }).parse(req.body);
  const blockerId = d.blockerId ?? t.id;
  const blockedId = d.blockedId ?? t.id;
  if (blockerId === blockedId) throw new HttpError(400, "A task can't depend on itself");
  await getTask(req, blockerId === t.id ? blockedId : blockerId);
  if (await wouldCycle(blockerId, blockedId)) throw new HttpError(400, "That would create a circular dependency");
  await prisma.taskDependency.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, update: {}, create: { blockerId, blockedId } });
  await prisma.taskActivity.create({ data: { taskId: blockedId, actorId: uid(req), action: "dependency", toValue: `blocked by #${blockerId}` } });
  await audit(req, "dependency_added", "task", blockedId, { new: { blockerId, blockedId } });
  res.json({ ok: true, impact: await dependencyImpact(cid(req), blockerId) });
});

tasksRouter.delete("/:id/dependencies/:blockerId/:blockedId", async (req, res) => {
  if (!manage(req)) throw new HttpError(403, "You can't change dependencies");
  await getTask(req, Number(req.params.id));
  await prisma.taskDependency.deleteMany({ where: { blockerId: Number(req.params.blockerId), blockedId: Number(req.params.blockedId) } });
  res.json({ ok: true });
});

// ---- Followers ----
tasksRouter.post("/:id/follow", async (req, res) => {
  const t = await getTask(req, Number(req.params.id));
  const { userId, follow } = z.object({ userId: z.number().int().optional(), follow: z.boolean().default(true) }).parse(req.body ?? {});
  const who = userId ?? uid(req);
  if (who !== uid(req) && !manage(req)) throw new HttpError(403, "You can only follow tasks yourself");
  if (follow) await prisma.taskFollower.upsert({ where: { taskId_userId: { taskId: t.id, userId: who } }, update: {}, create: { taskId: t.id, userId: who } });
  else await prisma.taskFollower.deleteMany({ where: { taskId: t.id, userId: who } });
  res.json({ ok: true });
});

// ---- Comments ----
tasksRouter.post("/:id/comments", async (req, res) => {
  const t = await getTask(req, Number(req.params.id));
  const d = z.object({ body: z.string().trim().min(1, "Write a comment").max(10000), mentions: z.array(z.number().int()).max(50).default([]) }).parse(req.body);
  const members = await prisma.membership.findMany({ where: { companyId: cid(req), userId: { in: d.mentions } }, select: { userId: true } });
  const mentions = members.map((m) => m.userId);
  const c = await prisma.comment.create({ data: { taskId: t.id, userId: uid(req), body: d.body, mentions: JSON.stringify(mentions) }, include: { user: { select: { id: true, name: true } } } });
  await prisma.taskActivity.create({ data: { taskId: t.id, actorId: uid(req), action: "comment", toValue: d.body.slice(0, 200) } });
  await prisma.taskFollower.upsert({ where: { taskId_userId: { taskId: t.id, userId: uid(req) } }, update: {}, create: { taskId: t.id, userId: uid(req) } });
  await notify(mentions.filter((m) => m !== uid(req)), { companyId: cid(req), type: "MENTION", title: `${req.user!.name} mentioned you on "${t.title}"`, body: d.body.slice(0, 200), link: `/tasks/${t.id}` });
  const others = [t.assigneeId, ...(await followersOf(t.id))].filter((u) => u !== uid(req) && !mentions.includes(u ?? -1));
  await notify(others, { companyId: cid(req), type: "COMMENT", title: `${req.user!.name} commented on "${t.title}"`, body: d.body.slice(0, 200), link: `/tasks/${t.id}` });
  res.status(201).json({ ...c, mentions });
});

tasksRouter.patch("/comments/:commentId", async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: Number(req.params.commentId) }, include: { task: true } });
  if (!c || c.task.companyId !== cid(req)) throw new HttpError(404, "Comment not found");
  if (c.userId !== uid(req)) throw new HttpError(403, "You can only edit your own comments");
  const { body } = z.object({ body: z.string().trim().min(1).max(10000) }).parse(req.body);
  res.json(await prisma.comment.update({ where: { id: c.id }, data: { body, editedAt: new Date() } }));
});

tasksRouter.delete("/comments/:commentId", async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: Number(req.params.commentId) }, include: { task: true } });
  if (!c || c.task.companyId !== cid(req)) throw new HttpError(404, "Comment not found");
  if (c.userId !== uid(req) && !manage(req)) throw new HttpError(403, "You can only delete your own comments");
  await prisma.comment.delete({ where: { id: c.id } });
  res.json({ ok: true });
});

// ---- Attachments ----
tasksRouter.post("/:id/attachments", upload.array("files", 5), async (req, res) => {
  const t = await getTask(req, Number(req.params.id));
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw new HttpError(400, "Choose a file to upload");
  const out = [];
  for (const f of files) {
    const a = await prisma.attachment.create({ data: { taskId: t.id, userId: uid(req), name: f.originalname.slice(0, 200), mime: f.mimetype, size: f.size, storedAs: f.filename } });
    await prisma.taskActivity.create({ data: { taskId: t.id, actorId: uid(req), action: "attachment", toValue: a.name } });
    out.push(a);
  }
  res.status(201).json(out);
});

tasksRouter.get("/attachments/:attId", async (req, res) => {
  const a = await prisma.attachment.findUnique({ where: { id: Number(req.params.attId) }, include: { task: true } });
  if (!a) throw new HttpError(404, "File not found");
  await getTask(req, a.taskId);
  res.setHeader("Content-Type", a.mime);
  res.setHeader("Content-Disposition", `${a.mime.startsWith("image/") || a.mime === "application/pdf" ? "inline" : "attachment"}; filename="${encodeURIComponent(a.name)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(UPLOAD_DIR, a.storedAs));
});

tasksRouter.delete("/attachments/:attId", async (req, res) => {
  const a = await prisma.attachment.findUnique({ where: { id: Number(req.params.attId) } });
  if (!a) throw new HttpError(404, "File not found");
  await getTask(req, a.taskId);
  if (a.userId !== uid(req) && !manage(req)) throw new HttpError(403, "You can only remove files you added");
  await prisma.attachment.delete({ where: { id: a.id } });
  fs.rm(path.join(UPLOAD_DIR, a.storedAs), () => undefined);
  res.json({ ok: true });
});

// ---- Templates ----
tasksRouter.post("/:id/template", async (req, res) => {
  if (!can(req, "tasks", "create")) throw new HttpError(403, "You can't create templates");
  const t = await getTask(req, Number(req.params.id));
  const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
  const subs = await prisma.task.findMany({ where: { parentId: t.id } });
  const payload = { title: t.title, description: t.description, priority: t.priority, estimateHours: t.estimateHours, billable: t.billable, tags: parseJson(t.tags, []), subtasks: subs.map((s) => ({ title: s.title, estimateHours: s.estimateHours })) };
  const tpl = await prisma.template.create({ data: { companyId: cid(req), kind: "TASK", name, payload: JSON.stringify(payload) } });
  res.status(201).json(tpl);
});

tasksRouter.post("/from-template", async (req, res) => {
  const d = z.object({ templateId: z.number().int(), projectId: z.number().int(), assigneeId: z.number().int().nullish(), dueDate: DATE.nullish() }).parse(req.body);
  const tpl = await prisma.template.findFirst({ where: { id: d.templateId, companyId: cid(req), kind: "TASK" } });
  if (!tpl) throw new HttpError(404, "Template not found");
  const p = parseJson<{ title: string; description?: string; priority?: string; estimateHours?: number; billable?: boolean; tags?: string[]; subtasks?: { title: string; estimateHours?: number }[] }>(tpl.payload, { title: tpl.name });
  const task = await createTask(req, { title: p.title, description: p.description ?? null, priority: (p.priority as (typeof PRIORITIES)[number]) ?? "NONE", estimateHours: p.estimateHours ?? null, billable: p.billable ?? true, tags: p.tags ?? [], projectId: d.projectId, assigneeId: d.assigneeId ?? null, dueDate: d.dueDate ?? null });
  for (const s of p.subtasks ?? []) await createTask(req, { title: s.title, estimateHours: s.estimateHours ?? null, projectId: d.projectId, parentId: task.id, assigneeId: d.assigneeId ?? null });
  res.status(201).json(task);
});
