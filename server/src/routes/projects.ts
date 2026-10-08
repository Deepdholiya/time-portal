import { Router, type Request } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, audit, notify, parseJson } from "../db.js";
import { HttpError, can, cid, randomToken, requirePerm, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { projectStats } from "../health.js";
import { DATE } from "../scope.js";
import { nextNumber } from "../tasks.js";
import { addDays, daysBetween } from "../weeks.js";

export const projectsRouter = Router();
const manageP = requirePerm("projects", "manage");

const COLORS = ["#5e6ad2", "#26b5ce", "#4cb782", "#f2c94c", "#f2994a", "#eb5757", "#bb87fc", "#95a2b3"];
type Links = { figma?: string; document?: string; drive?: string; other?: { label: string; url: string }[] };

const projectInclude = {
  client: { select: { id: true, name: true, email: true, contactName: true, phone: true } },
  manager: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  initiative: { select: { id: true, name: true, color: true } },
  members: { select: { user: { select: { id: true, name: true } } } },
  children: { select: { id: true, name: true, color: true, status: true, startDate: true, endDate: true, estimatedHours: true, archived: true } },
  milestones: { orderBy: { date: "asc" as const } },
} satisfies Prisma.ProjectInclude;
type FullProject = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function serialize(req: Request, p: FullProject, stats: Awaited<ReturnType<typeof projectStats>> extends Map<number, infer S> ? S | undefined : never, mine: Set<number> | "all") {
  const fin = can(req, "financials", "view");
  return {
    id: p.id, name: p.name, code: p.code, description: p.description, color: p.color, status: p.status, priority: p.priority, archived: p.archived,
    startDate: p.startDate, endDate: p.endDate, estimatedHours: p.estimatedHours, billingType: p.billingType,
    budget: fin ? p.budget : undefined, hourlyRate: fin ? p.hourlyRate : undefined,
    tags: parseJson<string[]>(p.tags, []), links: parseJson<Links>(p.links, {}),
    client: p.client, manager: p.manager, team: p.team, initiative: p.initiative,
    members: p.members.map((m) => m.user), children: p.children, milestones: p.milestones,
    hasShareLink: !!p.clientShareToken,
    access: mine === "all" || mine.has(p.id) ? "member" : "none",
    stats: stats ? { ...stats, revenue: fin ? stats.revenue : undefined, cost: fin ? stats.cost : undefined, budgetConsumed: fin ? stats.budgetConsumed : undefined, budgetRemaining: fin ? stats.budgetRemaining : undefined } : undefined,
  };
}

projectsRouter.get("/", async (req, res) => {
  const q = z.object({
    status: z.string().optional(), clientId: z.coerce.number().int().optional(), managerId: z.coerce.number().int().optional(),
    archived: z.enum(["true", "false", "all"]).default("false"), billing: z.string().optional(), tag: z.string().optional(), q: z.string().optional(),
  }).parse(req.query);
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const where: Prisma.ProjectWhereInput = { companyId: cid(req), parentId: null };
  // Everyone sees the project list; projects they can't log time on are marked as such. Archived projects need manage access.
  if (q.archived !== "all") where.archived = q.archived === "true";
  if (q.archived !== "false" && !can(req, "projects", "manage")) where.archived = false;
  if (q.status) where.status = { in: q.status.split(",") };
  if (q.clientId) where.clientId = q.clientId;
  if (q.managerId) where.managerId = q.managerId;
  if (q.billing) where.billingType = { in: q.billing.split(",") };
  if (q.tag) where.tags = { contains: `"${q.tag}"` };
  if (q.q) where.OR = [{ name: { contains: q.q } }, { code: { contains: q.q } }];
  if (ids !== "all" && !can(req, "projects", "manage")) {
    const parents = await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true } });
    where.id = { in: [...new Set(parents.map((p) => p.parentId ?? p.id))] };
  }
  const projects = await prisma.project.findMany({ where, include: projectInclude, orderBy: [{ archived: "asc" }, { name: "asc" }] });
  const stats = await projectStats(cid(req), projects.map((p) => p.id));
  const mine = ids === "all" ? "all" : new Set(ids);
  res.json(projects.map((p) => serialize(req, p, stats.get(p.id), mine)));
});

async function getProject(req: Request, id: number) {
  const p = await prisma.project.findFirst({ where: { id, companyId: cid(req) }, include: projectInclude });
  if (!p) throw new HttpError(404, "Project not found");
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  if (ids !== "all" && !ids.includes(p.id) && !ids.includes(p.parentId ?? -1) && !can(req, "projects", "manage")) throw new HttpError(403, "You don't have access to this project");
  return { p, ids };
}

projectsRouter.get("/:id", async (req, res) => {
  const { p, ids } = await getProject(req, Number(req.params.id));
  const stats = await projectStats(cid(req), [p.parentId ?? p.id]);
  const out = serialize(req, p, stats.get(p.parentId ?? p.id), ids === "all" ? "all" : new Set(ids));
  const parent = p.parentId ? await prisma.project.findUnique({ where: { id: p.parentId }, select: { id: true, name: true, color: true } }) : null;
  res.json({ ...out, notes: p.notes, parent, parentId: p.parentId, clientShareToken: can(req, "clientEmail", "yes") || can(req, "projects", "manage") ? p.clientShareToken : undefined });
});

const projectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name").max(120),
  code: z.string().trim().max(20).nullish(),
  description: z.string().max(5000).nullish(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"]).default("ACTIVE"),
  priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"]).default("MEDIUM"),
  health: z.enum(["ON_TRACK", "AT_RISK", "DELAYED"]).default("ON_TRACK"),
  startDate: DATE.nullish(), endDate: DATE.nullish(),
  estimatedHours: z.number().min(0).nullish(),
  budget: z.number().min(0).nullish(),
  billingType: z.enum(["HOURLY", "FIXED", "NON_BILLABLE"]).default("HOURLY"),
  hourlyRate: z.number().min(0).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  links: z.object({ figma: z.string().url().or(z.literal("")).optional(), document: z.string().url().or(z.literal("")).optional(), drive: z.string().url().or(z.literal("")).optional(), other: z.array(z.object({ label: z.string().max(60), url: z.string().url() })).max(20).optional() }).default({}),
  clientId: z.number().int().nullish(),
  // Inline client details: creates the client, or fills in its contact fields.
  clientName: z.string().trim().max(120).optional(), clientEmail: z.string().email().or(z.literal("")).optional(), contactName: z.string().max(120).optional(), phone: z.string().max(40).optional(),
  parentId: z.number().int().nullish(),
  managerId: z.number().int().nullish(),
  teamId: z.number().int().nullish(),
  initiativeId: z.number().int().nullish(),
  memberIds: z.array(z.number().int()).optional(),
});

async function resolveClient(req: Request, d: z.infer<typeof projectSchema>) {
  if (d.clientId) {
    const c = await prisma.client.findFirst({ where: { id: d.clientId, companyId: cid(req) } });
    if (!c) throw new HttpError(400, "Client not found");
    if (d.clientEmail || d.contactName || d.phone) await prisma.client.update({ where: { id: c.id }, data: { email: d.clientEmail || c.email, contactName: d.contactName || c.contactName, phone: d.phone || c.phone } });
    return c.id;
  }
  if (d.clientName) {
    const existing = await prisma.client.findFirst({ where: { companyId: cid(req), name: d.clientName } });
    if (existing) return existing.id;
    const c = await prisma.client.create({ data: { companyId: cid(req), name: d.clientName, email: d.clientEmail || null, contactName: d.contactName || null, phone: d.phone || null } });
    await audit(req, "client_created", "client", c.id, { new: { name: c.name } });
    return c.id;
  }
  return null;
}

function projectData(d: z.infer<typeof projectSchema>, clientId: number | null, fin: boolean) {
  return {
    name: d.name, code: d.code ?? null, description: d.description ?? null, status: d.status, priority: d.priority, health: d.health,
    startDate: d.startDate ?? null, endDate: d.endDate ?? null, estimatedHours: d.estimatedHours ?? null, billingType: d.billingType,
    ...(fin ? { budget: d.budget ?? null, hourlyRate: d.hourlyRate ?? null } : {}),
    tags: JSON.stringify(d.tags), links: JSON.stringify(d.links), clientId,
    parentId: d.parentId ?? null, managerId: d.managerId ?? null, teamId: d.teamId ?? null, initiativeId: d.initiativeId ?? null,
    ...(d.color ? { color: d.color } : {}),
  };
}

projectsRouter.post("/", manageP, async (req, res) => {
  const d = projectSchema.parse(req.body);
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw new HttpError(400, "End date must be after the start date");
  if (d.parentId && !(await prisma.project.findFirst({ where: { id: d.parentId, companyId: cid(req), parentId: null } }))) throw new HttpError(400, "Parent project not found");
  const clientId = await resolveClient(req, d);
  const count = await prisma.project.count({ where: { companyId: cid(req) } });
  const parent = d.parentId ? await prisma.project.findUnique({ where: { id: d.parentId } }) : null;
  const p = await prisma.project.create({ data: { ...projectData(d, clientId ?? parent?.clientId ?? null, can(req, "financials", "view")), companyId: cid(req), color: d.color ?? parent?.color ?? COLORS[count % COLORS.length] } });
  const members = new Set(d.memberIds ?? []);
  if (d.managerId) members.add(d.managerId);
  for (const userId of members) await prisma.projectMember.create({ data: { projectId: p.id, userId } }).catch(() => undefined);
  await audit(req, d.parentId ? "subproject_created" : "project_created", "project", p.id, { new: { name: p.name, parentId: p.parentId } });
  res.status(201).json(p);
});

projectsRouter.put("/:id", manageP, async (req, res) => {
  const { p: before } = await getProject(req, Number(req.params.id));
  const d = projectSchema.parse(req.body);
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw new HttpError(400, "End date must be after the start date");
  const clientId = await resolveClient(req, d);
  const p = await prisma.project.update({ where: { id: before.id }, data: projectData({ ...d, parentId: before.parentId }, clientId, can(req, "financials", "view")) });
  if (d.memberIds) {
    await prisma.projectMember.deleteMany({ where: { projectId: p.id } });
    for (const userId of new Set([...d.memberIds, ...(d.managerId ? [d.managerId] : [])])) await prisma.projectMember.create({ data: { projectId: p.id, userId } });
  }
  const changed = Object.fromEntries(Object.entries(projectData(d, clientId, true)).filter(([k, v]) => String((before as Record<string, unknown>)[k] ?? "") !== String(v ?? "")));
  await audit(req, "project_updated", "project", p.id, { old: Object.fromEntries(Object.keys(changed).map((k) => [k, (before as Record<string, unknown>)[k]])), new: changed });
  if (before.managerId !== p.managerId && p.managerId) await notify([p.managerId], { companyId: cid(req), type: "PROJECT_ASSIGNED", title: `You now manage ${p.name}`, link: `/projects/${p.id}` });
  res.json(p);
});

// Quick edits from the roadmap: dragging or resizing a project bar.
projectsRouter.patch("/:id/dates", requirePerm("roadmap", "edit"), async (req, res) => {
  const { p } = await getProject(req, Number(req.params.id));
  const d = z.object({ startDate: DATE.nullable(), endDate: DATE.nullable() }).parse(req.body);
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw new HttpError(400, "End date must be after the start date");
  await prisma.project.update({ where: { id: p.id }, data: d });
  await audit(req, "project_rescheduled", "project", p.id, { old: { startDate: p.startDate, endDate: p.endDate }, new: d });
  res.json({ ok: true });
});

projectsRouter.post("/:id/archive", manageP, async (req, res) => {
  const { p } = await getProject(req, Number(req.params.id));
  const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
  await prisma.project.updateMany({ where: { OR: [{ id: p.id }, { parentId: p.id }] }, data: { archived } });
  await audit(req, archived ? "project_archived" : "project_restored", "project", p.id, { old: { archived: p.archived }, new: { archived } });
  res.json({ ok: true });
});

projectsRouter.delete("/:id", async (req, res) => {
  if (req.user!.role !== "ADMIN") throw new HttpError(403, "Only admins can delete projects. Archive it instead.");
  const { p } = await getProject(req, Number(req.params.id));
  const entries = await prisma.timeEntry.count({ where: { OR: [{ projectId: p.id }, { project: { parentId: p.id } }] } });
  if (entries) throw new HttpError(409, `${p.name} has ${entries} time entries. Archive it so its history stays reportable.`);
  await prisma.project.delete({ where: { id: p.id } });
  await audit(req, "project_deleted", "project", p.id, { old: { name: p.name } });
  res.json({ ok: true });
});

projectsRouter.put("/:id/notes", async (req, res) => {
  const { p, ids } = await getProject(req, Number(req.params.id));
  if (!can(req, "projects", "manage") && (ids === "all" ? false : !ids.includes(p.id))) throw new HttpError(403, "You can't edit these notes");
  const { notes } = z.object({ notes: z.string().max(100_000) }).parse(req.body);
  await prisma.project.update({ where: { id: p.id }, data: { notes } });
  await audit(req, "project_notes_updated", "project", p.id);
  res.json({ ok: true });
});

projectsRouter.put("/:id/members", manageP, async (req, res) => {
  const { p } = await getProject(req, Number(req.params.id));
  const { userIds } = z.object({ userIds: z.array(z.number().int()) }).parse(req.body);
  const before = p.members.map((m) => m.user.id);
  await prisma.projectMember.deleteMany({ where: { projectId: p.id } });
  for (const userId of new Set(userIds)) await prisma.projectMember.create({ data: { projectId: p.id, userId } });
  await audit(req, "project_members_updated", "project", p.id, { old: before, new: userIds });
  const added = userIds.filter((u) => !before.includes(u));
  await notify(added, { companyId: cid(req), type: "ACCESS_CHANGED", title: `You were added to ${p.name}`, link: `/projects/${p.id}` });
  res.json({ ok: true });
});

// ---- Milestones ----
const milestoneSchema = z.object({ name: z.string().trim().min(1).max(120), date: DATE, description: z.string().max(2000).nullish(), done: z.boolean().default(false), projectId: z.number().int().optional() });

projectsRouter.post("/:id/milestones", manageP, async (req, res) => {
  const { p } = await getProject(req, Number(req.params.id));
  const d = milestoneSchema.parse(req.body);
  const m = await prisma.milestone.create({ data: { projectId: d.projectId ?? p.id, name: d.name, date: d.date, description: d.description ?? null, done: d.done } });
  await audit(req, "milestone_created", "milestone", m.id, { new: d });
  res.status(201).json(m);
});

async function getMilestone(req: Request, id: number) {
  const m = await prisma.milestone.findFirst({ where: { id, project: { companyId: cid(req) } } });
  if (!m) throw new HttpError(404, "Milestone not found");
  return m;
}

projectsRouter.put("/milestones/:mid", async (req, res) => {
  if (!can(req, "projects", "manage") && !can(req, "roadmap", "edit")) throw new HttpError(403, "You can't edit milestones");
  const m = await getMilestone(req, Number(req.params.mid));
  const d = milestoneSchema.partial().parse(req.body);
  const updated = await prisma.milestone.update({ where: { id: m.id }, data: { name: d.name, date: d.date, description: d.description, done: d.done } });
  await audit(req, "milestone_updated", "milestone", m.id, { old: m, new: updated });
  res.json(updated);
});

projectsRouter.delete("/milestones/:mid", manageP, async (req, res) => {
  const m = await getMilestone(req, Number(req.params.mid));
  await prisma.milestone.delete({ where: { id: m.id } });
  await audit(req, "milestone_deleted", "milestone", m.id, { old: m });
  res.json({ ok: true });
});

// ---- Files and activity ----
projectsRouter.get("/:id/files", async (req, res) => {
  const { p } = await getProject(req, Number(req.params.id));
  const files = await prisma.attachment.findMany({
    where: { task: { OR: [{ projectId: p.id }, { project: { parentId: p.id } }] } },
    include: { user: { select: { name: true } }, task: { select: { id: true, number: true, title: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ links: parseJson<Links>(p.links, {}), files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt, user: f.user, task: f.task })) });
});

projectsRouter.get("/:id/activity", async (req, res) => {
  const { p } = await getProject(req, Number(req.params.id));
  const taskIds = (await prisma.task.findMany({ where: { OR: [{ projectId: p.id }, { project: { parentId: p.id } }] }, select: { id: true } })).map((t) => t.id);
  const [logs, acts] = await Promise.all([
    prisma.auditLog.findMany({ where: { companyId: cid(req), entity: "project", entityId: p.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.taskActivity.findMany({ where: { taskId: { in: taskIds } }, include: { task: { select: { id: true, number: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 150 }),
  ]);
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: acts.map((a) => a.actorId).filter((x): x is number => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const items = [
    ...logs.map((l) => ({ at: l.createdAt, actor: l.user?.name ?? "System", text: l.action.replace(/_/g, " "), task: null })),
    ...acts.map((a) => ({ at: a.createdAt, actor: a.actorId ? actors.get(a.actorId) ?? "Someone" : "System", text: a.action === "field" ? `changed ${a.field} to ${a.toValue ?? "none"}` : a.action === "comment" ? `commented: ${a.toValue}` : a.action === "time" ? a.toValue ?? "logged time" : a.action, task: a.task })),
  ].sort((a, b) => +b.at - +a.at).slice(0, 150);
  res.json(items);
});

// ---- Client share link (client-safe status page) ----
projectsRouter.post("/:id/share", async (req, res) => {
  if (!can(req, "clientEmail", "yes") && !can(req, "projects", "manage")) throw new HttpError(403, "You can't share this project");
  const { p } = await getProject(req, Number(req.params.id));
  const token = p.clientShareToken ?? randomToken(18);
  await prisma.project.update({ where: { id: p.id }, data: { clientShareToken: token } });
  await audit(req, "client_link_created", "project", p.id);
  res.json({ token });
});

projectsRouter.delete("/:id/share", async (req, res) => {
  if (!can(req, "clientEmail", "yes") && !can(req, "projects", "manage")) throw new HttpError(403, "You can't change sharing");
  const { p } = await getProject(req, Number(req.params.id));
  await prisma.project.update({ where: { id: p.id }, data: { clientShareToken: null } });
  await audit(req, "client_link_revoked", "project", p.id);
  res.json({ ok: true });
});

// ---- Templates ----
type ProjectTemplate = {
  description?: string | null; estimatedHours?: number | null; billingType?: string; durationDays?: number | null;
  subprojects: { name: string }[];
  milestones: { name: string; offsetDays: number }[];
  tasks: { ref: number; title: string; section?: string | null; priority: string; estimateHours?: number | null; startOffset?: number | null; dueOffset?: number | null; sub?: string | null; parentRef?: number | null; blockedByRefs: number[] }[];
};

projectsRouter.post("/:id/template", manageP, async (req, res) => {
  const { p } = await getProject(req, Number(req.params.id));
  const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
  const base = p.startDate ?? new Date().toISOString().slice(0, 10);
  const tasks = await prisma.task.findMany({ where: { OR: [{ projectId: p.id }, { project: { parentId: p.id } }] }, include: { project: { select: { id: true, name: true } }, blockedBy: true } });
  const tpl: ProjectTemplate = {
    description: p.description, estimatedHours: p.estimatedHours, billingType: p.billingType,
    durationDays: p.startDate && p.endDate ? daysBetween(p.startDate, p.endDate) : null,
    subprojects: p.children.map((c) => ({ name: c.name })),
    milestones: p.milestones.map((m) => ({ name: m.name, offsetDays: daysBetween(base, m.date) })),
    tasks: tasks.map((t) => ({
      ref: t.id, title: t.title, section: t.section, priority: t.priority, estimateHours: t.estimateHours,
      startOffset: t.startDate ? daysBetween(base, t.startDate) : null, dueOffset: t.dueDate ? daysBetween(base, t.dueDate) : null,
      sub: t.projectId === p.id ? null : t.project.name, parentRef: t.parentId, blockedByRefs: t.blockedBy.map((b) => b.blockerId),
    })),
  };
  const row = await prisma.template.create({ data: { companyId: cid(req), kind: "PROJECT", name, payload: JSON.stringify(tpl) } });
  await audit(req, "template_created", "template", row.id, { new: { name } });
  res.status(201).json(row);
});

projectsRouter.post("/from-template", manageP, async (req, res) => {
  const d = z.object({ templateId: z.number().int(), name: z.string().trim().min(1).max(120), startDate: DATE, clientId: z.number().int().nullish(), managerId: z.number().int().nullish() }).parse(req.body);
  const row = await prisma.template.findFirst({ where: { id: d.templateId, companyId: cid(req), kind: "PROJECT" } });
  if (!row) throw new HttpError(404, "Template not found");
  const t = parseJson<ProjectTemplate>(row.payload, { subprojects: [], milestones: [], tasks: [] });
  const project = await prisma.project.create({
    data: {
      companyId: cid(req), name: d.name, description: t.description ?? null, estimatedHours: t.estimatedHours ?? null, billingType: t.billingType ?? "HOURLY",
      startDate: d.startDate, endDate: t.durationDays != null ? addDays(d.startDate, t.durationDays) : null, clientId: d.clientId ?? null, managerId: d.managerId ?? null, status: "PLANNING",
    },
  });
  if (d.managerId) await prisma.projectMember.create({ data: { projectId: project.id, userId: d.managerId } });
  const subIds = new Map<string, number>();
  for (const s of t.subprojects) subIds.set(s.name, (await prisma.project.create({ data: { companyId: cid(req), name: s.name, parentId: project.id, color: project.color, clientId: project.clientId } })).id);
  for (const m of t.milestones) await prisma.milestone.create({ data: { projectId: project.id, name: m.name, date: addDays(d.startDate, m.offsetDays) } });
  const refMap = new Map<number, number>();
  // Parents first so subtasks can link to them.
  const ordered = [...t.tasks].sort((a, b) => Number(!!a.parentRef) - Number(!!b.parentRef));
  for (const x of ordered) {
    const created = await prisma.task.create({
      data: {
        companyId: cid(req), number: await nextNumber(cid(req)), title: x.title, section: x.section ?? null, priority: x.priority, estimateHours: x.estimateHours ?? null,
        startDate: x.startOffset != null ? addDays(d.startDate, x.startOffset) : null, dueDate: x.dueOffset != null ? addDays(d.startDate, x.dueOffset) : null,
        projectId: x.sub ? subIds.get(x.sub) ?? project.id : project.id, parentId: x.parentRef ? refMap.get(x.parentRef) ?? null : null, creatorId: uid(req), status: "TODO",
      },
    });
    refMap.set(x.ref, created.id);
  }
  for (const x of t.tasks) for (const b of x.blockedByRefs) {
    const blocker = refMap.get(b), blocked = refMap.get(x.ref);
    if (blocker && blocked) await prisma.taskDependency.create({ data: { blockerId: blocker, blockedId: blocked } }).catch(() => undefined);
  }
  await audit(req, "project_created_from_template", "project", project.id, { new: { template: row.name } });
  res.status(201).json(project);
});

// ---- Initiatives (roadmap groupings) ----
projectsRouter.get("/meta/initiatives", async (req, res) => {
  res.json(await prisma.initiative.findMany({ where: { companyId: cid(req) }, orderBy: { name: "asc" } }));
});
projectsRouter.post("/meta/initiatives", requirePerm("roadmap", "edit"), async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#5e6ad2") }).parse(req.body);
  const i = await prisma.initiative.create({ data: { companyId: cid(req), ...d } });
  await audit(req, "initiative_created", "initiative", i.id, { new: d });
  res.status(201).json(i);
});
projectsRouter.delete("/meta/initiatives/:iid", requirePerm("roadmap", "edit"), async (req, res) => {
  await prisma.initiative.deleteMany({ where: { id: Number(req.params.iid), companyId: cid(req) } });
  res.json({ ok: true });
});
