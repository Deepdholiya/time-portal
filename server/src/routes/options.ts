import { Router } from "express";
import { prisma } from "../db.js";
import { accessibleProjectIds } from "../permissions.js";

// Lookup data for forms and filters.
export const optionsRouter = Router();

optionsRouter.get("/", async (req, res) => {
  const ids = await accessibleProjectIds(req.user!);
  const where = { status: { not: "ARCHIVED" }, ...(ids === "all" ? {} : { id: { in: ids } }) };
  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true, name: true, code: true, color: true, parentId: true, clientId: true, status: true,
      tasks: { where: { status: { not: "DONE" } }, select: { id: true, title: true }, orderBy: { title: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  // Every project the user can see in analytics/roadmap (not only the ones they log time on).
  const allProjects = await prisma.project.findMany({
    select: { id: true, name: true, color: true, parentId: true, clientId: true },
    orderBy: { name: "asc" },
  });
  const [users, teams, clients] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, teamId: true, role: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
  ]);
  res.json({ projects, allProjects, users, teams, clients });
});
