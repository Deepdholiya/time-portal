// Shared task helpers for the task list, board, detail panel and project pages.
import { patch } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { addDays, monthEnd, monthStart, today, weekStart } from "@/lib/format";
import type { Options, Priority, Task, TaskStatus, TimeEntry } from "@/lib/types";
import { PRIORITIES, PRIORITY_META, STATUSES, STATUS_META } from "@/components/app/icons";

export type ListTask = Task & { creatorId?: number | null; followed?: boolean };

export interface Impact { id: number; key: string; title: string; reason: string; startDate: string | null; dueDate: string | null }

export interface TaskDetail extends ListTask {
  description: string | null;
  creator: { id: number; name: string } | null;
  parent: { id: number; number: number; title: string; key: string } | null;
  blocking: { id: number; key: string; title: string; status: TaskStatus; startDate: string | null; dueDate: string | null }[];
  followers: { id: number; name: string }[];
  comments: { id: number; body: string; userId: number; user: { id: number; name: string }; mentions: number[]; createdAt: string; editedAt?: string | null }[];
  attachments: { id: number; name: string; mime: string; size: number; user: { id: number; name: string }; createdAt: string }[];
  activity: { id: number; action: string; field: string | null; fromValue: string | null; toValue: string | null; createdAt: string; actor: string | null }[];
  subtasks: ListTask[];
  timeEntries: TimeEntry[];
  canEdit: boolean;
  canManage: boolean;
}

export const useOptions = () => useApi<Options>("/options");

/** PATCH a task and refresh every task list; returns the server's dependency impact. */
export async function patchTask(id: number, body: Record<string, unknown>) {
  const r = await patch<ListTask & { impact: Impact[] }>(`/tasks/${id}`, body);
  invalidate("/tasks");
  invalidate("/projects");
  return r;
}

export type GroupBy = "status" | "project" | "assignee" | "priority" | "none";
export type OrderBy = "manual" | "priority" | "due" | "updated" | "created";

export interface TaskFilters {
  projectId: number | null;
  assignee: string[]; // "me" | "none" | user ids
  status: TaskStatus[];
  priority: Priority[];
  milestoneId: number | null;
  tag: string | null;
  due: string; // preset key or ""
  q: string;
}
export const EMPTY_FILTERS: TaskFilters = { projectId: null, assignee: [], status: [], priority: [], milestoneId: null, tag: null, due: "", q: "" };

export const filtersActive = (f: TaskFilters) =>
  !!(f.projectId || f.assignee.length || f.status.length || f.priority.length || f.milestoneId || f.tag || f.due || f.q);

export const DUE_PRESETS: { value: string; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "This week" },
  { value: "next14", label: "Next 14 days" },
  { value: "month", label: "This month" },
  { value: "nodate", label: "No due date" },
];

export function dueRange(preset: string): { dueFrom?: string; dueTo?: string } {
  const t = today();
  switch (preset) {
    case "overdue": return { dueTo: addDays(t, -1) };
    case "today": return { dueFrom: t, dueTo: t };
    case "week": { const s = weekStart(t); return { dueFrom: s, dueTo: addDays(s, 6) }; }
    case "next14": return { dueFrom: t, dueTo: addDays(t, 14) };
    case "month": return { dueFrom: monthStart(t), dueTo: monthEnd(t) };
    default: return {};
  }
}

/** Server query for the filters, plus a client-side predicate for what the API can't express. */
export function buildQuery(f: TaskFilters, meId: number, opts: { showDone: boolean; showSubtasks: boolean; fixedProjectId?: number }) {
  const q: Record<string, string | number | undefined> = {};
  const pid = opts.fixedProjectId ?? f.projectId;
  if (pid) q.projectId = pid;
  const ids = f.assignee.filter((a) => a !== "none").map((a) => (a === "me" ? meId : Number(a)));
  const wantsNone = f.assignee.includes("none");
  if (wantsNone && !ids.length) q.assigneeId = "none";
  else if (ids.length && !wantsNone) q.assigneeId = ids.join(",");
  if (f.status.length) q.status = f.status.join(",");
  if (f.priority.length) q.priority = f.priority.join(",");
  if (f.milestoneId) q.milestoneId = f.milestoneId;
  if (f.tag) q.tag = f.tag;
  if (f.q.trim()) q.q = f.q.trim();
  Object.assign(q, dueRange(f.due));
  if (f.due === "overdue") q.includeDone = "false";
  else if (!opts.showDone && !f.status.includes("DONE")) q.includeDone = "false";
  q.parent = opts.showSubtasks ? "all" : "top";
  const keep = (t: ListTask) => {
    if (wantsNone && ids.length && !(t.assignee == null || ids.includes(t.assignee.id))) return false;
    if (f.due === "nodate" && t.dueDate) return false;
    // dueFrom/dueTo on the server also match start dates; keep the list about due dates.
    const r = dueRange(f.due);
    if ((r.dueFrom || r.dueTo) && (!t.dueDate || (r.dueFrom && t.dueDate < r.dueFrom) || (r.dueTo && t.dueDate > r.dueTo))) return false;
    return true;
  };
  return { query: q, keep };
}

const PRI_RANK = (p: Priority) => (p === "NONE" ? 9 : PRIORITY_META[p].rank);
export function sortTasks(list: ListTask[], order: OrderBy) {
  const a = [...list];
  switch (order) {
    case "priority": return a.sort((x, y) => PRI_RANK(x.priority) - PRI_RANK(y.priority) || (x.dueDate ?? "9").localeCompare(y.dueDate ?? "9"));
    case "due": return a.sort((x, y) => (x.dueDate ?? "9999").localeCompare(y.dueDate ?? "9999") || PRI_RANK(x.priority) - PRI_RANK(y.priority));
    case "updated": return a.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
    case "created": return a.sort((x, y) => y.number - x.number);
    default: return a;
  }
}

export interface Group { key: string; label: string; status?: TaskStatus; priority?: Priority; color?: string; userName?: string | null; tasks: ListTask[]; defaults: Record<string, unknown> }

export function groupTasks(list: ListTask[], by: GroupBy, opts: { showEmptyStatuses?: boolean; showDone?: boolean } = {}): Group[] {
  if (by === "none") return [{ key: "all", label: "All tasks", tasks: list, defaults: {} }];
  if (by === "status") {
    return STATUSES.map((s) => ({ key: s, label: STATUS_META[s].label, status: s, tasks: list.filter((t) => t.status === s), defaults: { status: s } }))
      .filter((g) => g.tasks.length || (opts.showEmptyStatuses && (g.status !== "DONE" || opts.showDone)));
  }
  if (by === "priority") {
    return PRIORITIES.map((p) => ({ key: p, label: PRIORITY_META[p].label, priority: p, tasks: list.filter((t) => t.priority === p), defaults: {} })).filter((g) => g.tasks.length);
  }
  const map = new Map<string, Group>();
  for (const t of list) {
    if (by === "project") {
      const top = t.project?.parent ?? t.project;
      const k = String(t.project?.id ?? 0);
      const label = t.project?.parent ? `${t.project.parent.name} › ${t.project.name}` : t.project?.name ?? "No project";
      if (!map.has(k)) map.set(k, { key: k, label, color: top?.color, tasks: [], defaults: { projectId: t.project?.id } });
      map.get(k)!.tasks.push(t);
    } else {
      const k = String(t.assignee?.id ?? "none");
      if (!map.has(k)) map.set(k, { key: k, label: t.assignee?.name ?? "Unassigned", userName: t.assignee?.name ?? null, tasks: [], defaults: { assigneeId: t.assignee?.id ?? null } });
      map.get(k)!.tasks.push(t);
    }
  }
  return [...map.values()].sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
}

export const RECURRENCE = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

export const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
