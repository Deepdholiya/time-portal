import { Router } from "express";
import { prisma, parseJson, companySettings } from "../db.js";
import { cid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";

export const optionsRouter = Router();

// Everything pickers need in one call: projects the user can log time on, people, teams, clients, milestones and custom fields.
optionsRouter.get("/", async (req, res) => {
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const projects = await prisma.project.findMany({
    where: { companyId: cid(req), archived: false },
    select: { id: true, name: true, code: true, color: true, parentId: true, clientId: true, status: true, billingType: true, tags: true, tasks: { where: { status: { not: "DONE" }, parentId: null }, select: { id: true, number: true, title: true, assigneeId: true }, orderBy: { number: "asc" } }, milestones: { select: { id: true, name: true, date: true }, orderBy: { date: "asc" } } },
    orderBy: { name: "asc" },
  });
  const [members, teams, clients, customFields, templates, initiatives] = await Promise.all([
    prisma.membership.findMany({ where: { companyId: cid(req), user: { status: { not: "DEACTIVATED" } } }, select: { teamId: true, user: { select: { id: true, name: true, email: true, role: true, status: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.team.findMany({ where: { companyId: cid(req) }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { companyId: cid(req), archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.customField.findMany({ where: { companyId: cid(req) } }),
    prisma.template.findMany({ where: { companyId: cid(req) }, select: { id: true, kind: true, name: true } }),
    prisma.initiative.findMany({ where: { companyId: cid(req) } }),
  ]);
  const key = companySettings(req.company!).taskKey;
  const tags = new Set<string>();
  projects.forEach((p) => parseJson<string[]>(p.tags, []).forEach((t) => tags.add(t)));
  (await prisma.task.findMany({ where: { companyId: cid(req), tags: { not: "[]" } }, select: { tags: true }, take: 2000 })).forEach((t) => parseJson<string[]>(t.tags, []).forEach((x) => tags.add(x)));
  res.json({
    projects: projects.map((p) => ({ ...p, tags: parseJson<string[]>(p.tags, []), tasks: p.tasks.map((t) => ({ ...t, key: `${key}-${t.number}` })), canLog: ids === "all" || ids.includes(p.id) })),
    users: members.map((m) => ({ ...m.user, teamId: m.teamId })),
    teams, clients, initiatives, templates, tags: [...tags].sort(),
    customFields: customFields.map((f) => ({ ...f, options: parseJson<string[]>(f.options, []) })),
    taskKey: key,
  });
});
