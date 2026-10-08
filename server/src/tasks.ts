// Shared task helpers: numbering, serialization, dependency impact and recurrence.
import type { Prisma } from "@prisma/client";
import { prisma, companySettings, parseJson } from "./db.js";
import { addDays } from "./weeks.js";

export const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"] as const;
export const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const;

export async function nextNumber(companyId: number) {
  const last = await prisma.task.findFirst({ where: { companyId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

export const taskListInclude = {
  assignee: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, color: true, parentId: true, parent: { select: { id: true, name: true, color: true } } } },
  milestone: { select: { id: true, name: true, date: true } },
  blockedBy: { select: { blocker: { select: { id: true, number: true, title: true, status: true, dueDate: true } } } },
  _count: { select: { subtasks: true, comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

type ListTask = Prisma.TaskGetPayload<{ include: typeof taskListInclude }>;

export async function serializeTasks(companyId: number, tasks: ListTask[]) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const key = companySettings(company).taskKey;
  const ids = tasks.map((t) => t.id);
  const tracked = ids.length ? await prisma.timeEntry.groupBy({ by: ["taskId"], where: { taskId: { in: ids }, running: false }, _sum: { minutes: true } }) : [];
  const trackedMap = new Map(tracked.map((t) => [t.taskId, t._sum.minutes ?? 0]));
  const subDone = ids.length ? await prisma.task.groupBy({ by: ["parentId"], where: { parentId: { in: ids }, status: "DONE" }, _count: { _all: true } }) : [];
  const subDoneMap = new Map(subDone.map((s) => [s.parentId, s._count._all]));
  return tasks.map((t) => {
    const blockers = t.blockedBy.map((b) => b.blocker);
    const openBlockers = blockers.filter((b) => b.status !== "DONE");
    const begins = t.startDate ?? t.dueDate;
    const conflict = blockers.some((b) => b.dueDate && begins && b.status !== "DONE" && b.dueDate >= begins);
    const subtaskCount = t._count.subtasks;
    const done = subDoneMap.get(t.id) ?? 0;
    return {
      id: t.id, key: `${key}-${t.number}`, number: t.number, title: t.title, status: t.status, priority: t.priority, section: t.section, sortOrder: t.sortOrder,
      startDate: t.startDate, dueDate: t.dueDate, estimateHours: t.estimateHours, billable: t.billable, recurrence: t.recurrence,
      tags: parseJson<string[]>(t.tags, []), customFields: parseJson<Record<string, unknown>>(t.customFields, {}),
      parentId: t.parentId, projectId: t.projectId, project: t.project, milestone: t.milestone, assignee: t.assignee,
      trackedMinutes: trackedMap.get(t.id) ?? 0, subtaskCount, subtaskDone: done,
      progress: t.status === "DONE" ? 1 : subtaskCount ? done / subtaskCount : t.status === "IN_REVIEW" ? 0.8 : t.status === "IN_PROGRESS" ? 0.4 : 0,
      commentCount: t._count.comments, attachmentCount: t._count.attachments,
      blockedBy: blockers.map((b) => ({ id: b.id, key: `${key}-${b.number}`, title: b.title, status: b.status, dueDate: b.dueDate })),
      isBlocked: openBlockers.length > 0, conflict,
      overdue: !!t.dueDate && t.status !== "DONE" && t.dueDate < new Date().toISOString().slice(0, 10),
      completedAt: t.completedAt, createdAt: t.createdAt, updatedAt: t.updatedAt,
    };
  });
}

export type Impact = { id: number; key: string; title: string; reason: string; startDate: string | null; dueDate: string | null };

// Walks downstream dependencies and reports tasks that would now start on or before a blocker finishes.
export async function dependencyImpact(companyId: number, taskId: number): Promise<Impact[]> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const key = companySettings(company).taskKey;
  const out: Impact[] = [];
  const seen = new Set<number>();
  const queue = [taskId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = await prisma.task.findUnique({ where: { id }, include: { blocking: { include: { blocked: true } } } });
    if (!t) continue;
    for (const { blocked } of t.blocking) {
      const begins = blocked.startDate ?? blocked.dueDate;
      if (t.dueDate && begins && begins <= t.dueDate && blocked.status !== "DONE") {
        out.push({ id: blocked.id, key: `${key}-${blocked.number}`, title: blocked.title, startDate: blocked.startDate, dueDate: blocked.dueDate, reason: `starts ${begins}, but ${key}-${t.number} is due ${t.dueDate}` });
      }
      queue.push(blocked.id);
    }
  }
  return out;
}

// Moves every downstream task so it starts the day after its latest blocker is due, keeping its duration.
export async function shiftDependents(taskId: number) {
  const moved: number[] = [];
  const queue = [taskId];
  const seen = new Set<number>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = await prisma.task.findUnique({ where: { id }, include: { blocking: { include: { blocked: { include: { blockedBy: { include: { blocker: true } } } } } } } });
    if (!t) continue;
    for (const { blocked } of t.blocking) {
      const latest = blocked.blockedBy.map((b) => b.blocker.dueDate).filter(Boolean).sort().pop();
      const begins = blocked.startDate ?? blocked.dueDate;
      if (latest && begins && begins <= latest && blocked.status !== "DONE") {
        const newStart = addDays(latest, 1);
        const delta = Math.round((Date.parse(newStart) - Date.parse(begins)) / 864e5);
        await prisma.task.update({
          where: { id: blocked.id },
          data: { startDate: blocked.startDate ? addDays(blocked.startDate, delta) : null, dueDate: blocked.dueDate ? addDays(blocked.dueDate, delta) : null },
        });
        await prisma.taskActivity.create({ data: { taskId: blocked.id, action: "field", field: "dates", fromValue: `${blocked.startDate ?? ""} → ${blocked.dueDate ?? ""}`, toValue: "shifted after dependency moved" } });
        moved.push(blocked.id);
      }
      queue.push(blocked.id);
    }
  }
  return moved;
}

export async function wouldCycle(blockerId: number, blockedId: number) {
  // Adding blocker → blocked creates a cycle if blocked already (transitively) blocks blocker.
  const stack = [blockedId];
  const seen = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === blockerId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const next = await prisma.taskDependency.findMany({ where: { blockerId: id }, select: { blockedId: true } });
    next.forEach((n) => stack.push(n.blockedId));
  }
  return false;
}

export function nextOccurrence(date: string | null, recurrence: string) {
  if (!date) return null;
  if (recurrence === "DAILY") return addDays(date, 1);
  if (recurrence === "WEEKLY") return addDays(date, 7);
  const d = new Date(date + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
