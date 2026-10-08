import type { Priority, TaskStatus, TimeEntry } from "@/lib/types";

export interface CalTask { id: number; key: string; title: string; status: TaskStatus; priority: Priority; startDate?: string | null; dueDate?: string | null; project?: { name: string; color: string } | null; assignee?: { name: string } | null }
export interface CalMilestone { id: number; name: string; date: string; done: boolean; project: { id: number; name: string; color: string } }
export interface CalLeave { id: number; from: string; to: string; type: string; status: string; halfDay: boolean; user: { id: number; name: string } }
export interface CalHoliday { id: number; date: string; name: string }
export interface CalData { canReschedule: boolean; entries: TimeEntry[]; tasks: CalTask[]; milestones: CalMilestone[]; leave: CalLeave[]; holidays: CalHoliday[] }

export interface DayBucket { entries: TimeEntry[]; minutes: number; tasks: CalTask[]; milestones: CalMilestone[]; leave: CalLeave[]; holiday?: CalHoliday }
export type Layers = { time: boolean; tasks: boolean; milestones: boolean; leave: boolean };

export function bucketize(data: CalData | undefined, days: string[]): Record<string, DayBucket> {
  const out: Record<string, DayBucket> = {};
  for (const d of days) out[d] = { entries: [], minutes: 0, tasks: [], milestones: [], leave: [] };
  if (!data) return out;
  for (const e of data.entries) { const b = out[e.date]; if (b) { b.entries.push(e); b.minutes += e.minutes; } }
  for (const t of data.tasks) { const b = t.dueDate ? out[t.dueDate] : undefined; if (b) b.tasks.push(t); }
  for (const m of data.milestones) out[m.date]?.milestones.push(m);
  for (const h of data.holidays) if (out[h.date]) out[h.date].holiday = h;
  for (const l of data.leave) for (const d of days) if (d >= l.from && d <= l.to) out[d].leave.push(l);
  return out;
}

/** Time entries summed per project for compact month cells. */
export function entriesByProject(entries: TimeEntry[]) {
  const m = new Map<number, { id: number; name: string; color: string; minutes: number }>();
  for (const e of entries) {
    const g = m.get(e.projectId) ?? { id: e.projectId, name: e.project?.name ?? "", color: e.project?.color ?? "var(--text-3)", minutes: 0 };
    g.minutes += e.minutes;
    m.set(e.projectId, g);
  }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes);
}

export const LEAVE_LABEL: Record<string, string> = { VACATION: "Vacation", SICK: "Sick leave", PERSONAL: "Personal", OTHER: "Leave" };
