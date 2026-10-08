import { Router } from "express";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { HttpError, requirePerm } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";

export const projectsRouter = Router();
const canManage = requirePerm("manageProjects", "yes");

const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
const HEALTH = ["ON_TRACK", "AT_RISK", "DELAYED"] as const;
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => (v ? new Date(v + "T00:00:00Z") : null));

const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(20).nullish(),
  description: z.string().max(4000).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2a78d6"),
  status: z.enum(STATUSES).default("ACTIVE"),
  health: z.enum(HEALTH).default("ON_TRACK"),
  startDate: optDate,
  endDate: optDate,
  estimatedHours: z.number().nonnegative().nullish(),
  clientId: z.number().int().nullish(),
  parentId: z.number().int().nullish(),
  managerId: z.number().int().nullish(),
});

async function minutesByProject() {
  const rows = await prisma.timeEntry.groupBy({ by: ["projectId"], _sum: { minutes: true }, where: { running: false } });
  return new Map(rows.map((r) => [r.projectId, r._sum.minutes ?? 0]));
}

// Project tree with tracked hours and task progress. Users who can't manage projects see the ones they work on.
projectsRouter.get("/", async (req, res) => {
  const ids = req.perms!.manageProjects === "yes" ? "all" : await accessibleProjectIds(req.user!);
  const projects = await prisma.project.findMany({
    where: ids === "all" ? {} : { id: { in: ids } },
    include: {
      client: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      members: { select: { user: { select: { id: true, name: true } } } },
      milestones: { orderBy: { dueDate: "asc" } },
      tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
    },
    orderBy: { name: "asc" },
  });
  const mins = await minutesByProject();
  const shaped = projects.map((p) => ({
    ...p,
    members: p.members.map((m) => m.user),
    trackedMinutes: mins.get(p.id) ?? 0,
  }));
  const top = shaped.filter((p) => !p.parentId || !shaped.some((q) => q.id === p.parentId));
  res.json(top.map((p) => {
    const children = shaped.filter((c) => c.parentId === p.id);
    return { ...p, children, totalMinutes: p.trackedMinutes + children.reduce((s, c) => s + c.trackedMinutes, 0) };
  }));
});

projectsRouter.post("/", canManage, async (req, res) => {
  const d = projectSchema.parse(req.body);
  if (d.parentId) {
    const parent = await prisma.project.findUnique({ where: { id: d.parentId } });
    if (!parent) throw new HttpError(400, "Parent project not found");
    if (parent.parentId) throw new HttpError(400, "Sub-projects can't have their own sub-projects yet");
    d.clientId = d.clientId ?? parent.clientId;
  }
  const project = await prisma.project.create({ data: d });
  await audit(req.user!.id, "project_created", "project", project.id, { name: project.name, parentId: d.parentId });
  res.status(201).json(project);
});

projectsRouter.put("/:id", canManage, async (req, res) => {
  const id = Number(req.params.id);
  const d = projectSchema.partial().parse(req.body);
  if (d.parentId === id) throw new HttpError(400, "A project can't be its own parent");
  const project = await prisma.project.update({ where: { id }, data: d });
  await audit(req.user!.id, "project_edited", "project", id, d);
  res.json(project);
});

projectsRouter.delete("/:id", canManage, async (req, res) => {
  const id = Number(req.params.id);
  const count = await prisma.timeEntry.count({ where: { OR: [{ projectId: id }, { project: { parentId: id } }] } });
  if (count) {
    // Keep history intact: projects with logged time are archived, not deleted.
    await prisma.project.updateMany({ where: { OR: [{ id }, { parentId: id }] }, data: { status: "ARCHIVED" } });
    await audit(req.user!.id, "project_archived", "project", id);
    return res.json({ archived: true });
  }
  await prisma.project.delete({ where: { id } });
  await audit(req.user!.id, "project_deleted", "project", id);
  res.json({ deleted: true });
});

projectsRouter.put("/:id/members", canManage, async (req, res) => {
  const id = Number(req.params.id);
  const { userIds } = z.object({ userIds: z.array(z.number().int()) }).parse(req.body);
  await prisma.$transaction([
    prisma.projectMember.deleteMany({ where: { projectId: id } }),
    prisma.projectMember.createMany({ data: userIds.map((userId) => ({ projectId: id, userId })) }),
  ]);
  await audit(req.user!.id, "project_members_changed", "project", id, { userIds });
  res.json({ ok: true });
});

// ---- Milestones ----
const milestoneSchema = z.object({ name: z.string().trim().min(1), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), done: z.boolean().default(false) });

projectsRouter.post("/:id/milestones", canManage, async (req, res) => {
  const d = milestoneSchema.parse(req.body);
  const m = await prisma.milestone.create({ data: { name: d.name, done: d.done, dueDate: new Date(d.dueDate + "T00:00:00Z"), projectId: Number(req.params.id) } });
  await audit(req.user!.id, "milestone_created", "milestone", m.id, d);
  res.status(201).json(m);
});

projectsRouter.put("/milestones/:mid", canManage, async (req, res) => {
  const d = milestoneSchema.partial().parse(req.body);
  const m = await prisma.milestone.update({ where: { id: Number(req.params.mid) }, data: { ...d, dueDate: d.dueDate ? new Date(d.dueDate + "T00:00:00Z") : undefined } });
  await audit(req.user!.id, "milestone_edited", "milestone", m.id, d);
  res.json(m);
});

projectsRouter.delete("/milestones/:mid", canManage, async (req, res) => {
  await prisma.milestone.delete({ where: { id: Number(req.params.mid) } });
  await audit(req.user!.id, "milestone_deleted", "milestone", Number(req.params.mid));
  res.json({ ok: true });
});

// ---- Tasks ----
const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).default("TODO"),
  estimatedHours: z.number().nonnegative().nullish(),
  dueDate: optDate,
  assigneeId: z.number().int().nullish(),
});

projectsRouter.post("/:id/tasks", canManage, async (req, res) => {
  const d = taskSchema.parse(req.body);
  const t = await prisma.task.create({ data: { ...d, projectId: Number(req.params.id) } });
  await audit(req.user!.id, "task_created", "task", t.id, { title: t.title });
  res.status(201).json(t);
});

// Assignees may move their own task's status; other edits need manage rights.
projectsRouter.put("/tasks/:tid", async (req, res) => {
  const id = Number(req.params.tid);
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new HttpError(404, "Task not found");
  const d = taskSchema.partial().parse(req.body);
  const statusOnly = Object.keys(d).every((k) => k === "status");
  if (req.perms!.manageProjects !== "yes" && !(statusOnly && task.assigneeId === req.user!.id)) throw new HttpError(403, "You can't edit this task");
  const t = await prisma.task.update({ where: { id }, data: d });
  await audit(req.user!.id, "task_edited", "task", id, d);
  res.json(t);
});

projectsRouter.delete("/tasks/:tid", canManage, async (req, res) => {
  await prisma.task.delete({ where: { id: Number(req.params.tid) } });
  await audit(req.user!.id, "task_deleted", "task", Number(req.params.tid));
  res.json({ ok: true });
});
