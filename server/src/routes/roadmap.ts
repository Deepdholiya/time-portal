import { Router } from "express";
import { prisma } from "../db.js";
import { requirePerm } from "../auth.js";

export const roadmapRouter = Router();

// Every non-archived project with its sub-projects, milestones and progress signals.
roadmapRouter.get("/", requirePerm("roadmap", "view"), async (_req, res) => {
  const projects = await prisma.project.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: {
      client: { select: { name: true } },
      manager: { select: { name: true } },
      milestones: { orderBy: { dueDate: "asc" } },
      tasks: { select: { status: true } },
    },
    orderBy: [{ startDate: "asc" }, { name: "asc" }],
  });
  const sums = await prisma.timeEntry.groupBy({ by: ["projectId"], _sum: { minutes: true }, where: { running: false } });
  const mins = new Map(sums.map((s) => [s.projectId, s._sum.minutes ?? 0]));
  const shape = (p: (typeof projects)[number]) => {
    const tasksDone = p.tasks.filter((t) => t.status === "DONE").length;
    const { tasks, ...rest } = p;
    return { ...rest, trackedMinutes: mins.get(p.id) ?? 0, tasksDone, tasksTotal: tasks.length, progress: tasks.length ? tasksDone / tasks.length : null };
  };
  const top = projects.filter((p) => !p.parentId).map((p) => {
    const children = projects.filter((c) => c.parentId === p.id).map(shape);
    const self = shape(p);
    const tasksTotal = self.tasksTotal + children.reduce((s, c) => s + c.tasksTotal, 0);
    const tasksDone = self.tasksDone + children.reduce((s, c) => s + c.tasksDone, 0);
    return {
      ...self, children,
      totalMinutes: self.trackedMinutes + children.reduce((s, c) => s + c.trackedMinutes, 0),
      progress: tasksTotal ? tasksDone / tasksTotal : null,
      tasksDone, tasksTotal,
    };
  });
  res.json(top);
});
