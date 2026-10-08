// Project statistics and computed health, shared by projects, analytics, roadmap and notifications.
import { prisma, parseJson } from "./db.js";
import { entryInclude, money } from "./scope.js";
import { today, daysBetween } from "./weeks.js";

export type ProjectStats = {
  trackedMinutes: number; billableMinutes: number; revenue: number; cost: number;
  tasks: { total: number; done: number; overdue: number; blocked: number; conflicts: number; estimateHours: number };
  progress: number; missedMilestones: number; nextMilestone: { id: number; name: string; date: string } | null;
  health: "ON_TRACK" | "AT_RISK" | "DELAYED"; reasons: string[];
  budgetConsumed: number | null; budgetRemaining: number | null; hourVariance: number | null;
};

// Stats for top-level projects including their sub-projects.
export async function projectStats(companyId: number, projectIds?: number[]): Promise<Map<number, ProjectStats>> {
  const projects = await prisma.project.findMany({
    where: { companyId, parentId: null, ...(projectIds ? { id: { in: projectIds } } : {}) },
    include: { children: { select: { id: true } }, milestones: true },
  });
  const allIds = projects.flatMap((p) => [p.id, ...p.children.map((c) => c.id)]);
  const topOf = new Map<number, number>();
  projects.forEach((p) => { topOf.set(p.id, p.id); p.children.forEach((c) => topOf.set(c.id, p.id)); });

  const entries = await prisma.timeEntry.findMany({ where: { companyId, projectId: { in: allIds }, running: false }, include: entryInclude });
  const tasks = await prisma.task.findMany({
    where: { companyId, projectId: { in: allIds } },
    select: { id: true, projectId: true, status: true, dueDate: true, startDate: true, estimateHours: true, blockedBy: { select: { blocker: { select: { status: true, dueDate: true } } } } },
  });
  const t0 = today();
  const out = new Map<number, ProjectStats>();
  for (const p of projects) {
    out.set(p.id, {
      trackedMinutes: 0, billableMinutes: 0, revenue: 0, cost: 0,
      tasks: { total: 0, done: 0, overdue: 0, blocked: 0, conflicts: 0, estimateHours: 0 },
      progress: 0, missedMilestones: 0, nextMilestone: null, health: "ON_TRACK", reasons: [], budgetConsumed: null, budgetRemaining: null, hourVariance: null,
    });
  }
  for (const e of entries) {
    const s = out.get(topOf.get(e.projectId)!);
    if (!s) continue;
    s.trackedMinutes += e.minutes;
    if (e.billable) s.billableMinutes += e.minutes;
    const m = money(e);
    s.revenue += m.revenue; s.cost += m.cost;
  }
  for (const t of tasks) {
    const s = out.get(topOf.get(t.projectId)!);
    if (!s) continue;
    s.tasks.total++;
    s.tasks.estimateHours += t.estimateHours ?? 0;
    if (t.status === "DONE") s.tasks.done++;
    else {
      if (t.dueDate && t.dueDate < t0) s.tasks.overdue++;
      if (t.status === "BLOCKED" || t.blockedBy.some((b) => b.blocker.status !== "DONE")) s.tasks.blocked++;
      const begins = t.startDate ?? t.dueDate;
      if (t.blockedBy.some((b) => b.blocker.status !== "DONE" && b.blocker.dueDate && begins && b.blocker.dueDate >= begins)) s.tasks.conflicts++;
    }
  }
  for (const p of projects) {
    const s = out.get(p.id)!;
    s.progress = s.tasks.total ? s.tasks.done / s.tasks.total : p.status === "COMPLETED" ? 1 : 0;
    const open = p.milestones.filter((m) => !m.done).sort((a, b) => a.date.localeCompare(b.date));
    s.missedMilestones = open.filter((m) => m.date < t0).length;
    const next = open.find((m) => m.date >= t0);
    s.nextMilestone = next ? { id: next.id, name: next.name, date: next.date } : null;
    const hours = s.trackedMinutes / 60;
    if (p.estimatedHours) s.hourVariance = hours - p.estimatedHours;
    if (p.budget != null) {
      s.budgetConsumed = p.billingType === "FIXED" ? s.cost : s.revenue;
      s.budgetRemaining = p.budget - s.budgetConsumed;
    }
    // Health signals: missed milestones, late end date, hour and budget overruns, overdue and blocked work, schedule lag.
    const red: string[] = [], amber: string[] = [];
    if (p.status === "COMPLETED") { s.health = "ON_TRACK"; s.reasons = ["Completed"]; continue; }
    if (s.missedMilestones) red.push(`${s.missedMilestones} missed milestone${s.missedMilestones > 1 ? "s" : ""}`);
    if (p.endDate && p.endDate < t0) red.push(`Past end date (${p.endDate})`);
    if (p.estimatedHours && hours > p.estimatedHours * 1.1 && s.progress < 1) red.push(`${Math.round((hours / p.estimatedHours) * 100)}% of estimated hours used`);
    if (p.budget && s.budgetConsumed! > p.budget) red.push("Over budget");
    if (s.tasks.overdue) amber.push(`${s.tasks.overdue} overdue task${s.tasks.overdue > 1 ? "s" : ""}`);
    if (s.tasks.conflicts) amber.push(`${s.tasks.conflicts} dependency conflict${s.tasks.conflicts > 1 ? "s" : ""}`);
    if (s.tasks.blocked) amber.push(`${s.tasks.blocked} blocked`);
    if (p.estimatedHours && hours > p.estimatedHours * 0.9 && s.progress < 0.75) amber.push("Hours running ahead of progress");
    if (p.budget && s.budgetConsumed! > p.budget * 0.85 && s.progress < 0.85) amber.push("Budget running ahead of progress");
    if (p.startDate && p.endDate && p.startDate < t0 && s.tasks.total) {
      const elapsed = daysBetween(p.startDate, t0) / Math.max(1, daysBetween(p.startDate, p.endDate));
      if (elapsed - s.progress > 0.3) amber.push("Behind schedule");
    }
    s.health = red.length ? "DELAYED" : amber.length >= 1 && (amber.length > 1 || s.tasks.overdue > 2 || s.tasks.conflicts > 0) ? "AT_RISK" : "ON_TRACK";
    s.reasons = [...red, ...amber];
    // A manual override from the project manager wins if it is more severe.
    const rank = { ON_TRACK: 0, AT_RISK: 1, DELAYED: 2 } as const;
    const manual = p.health as keyof typeof rank;
    if (rank[manual] > rank[s.health]) { s.health = manual; s.reasons.unshift("Marked by project manager"); }
  }
  return out;
}

export const tags = (s: string) => parseJson<string[]>(s, []);
