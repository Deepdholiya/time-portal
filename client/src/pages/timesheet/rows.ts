import type { Options, TimeEntry } from "@/lib/types";
import { defaultBillable } from "../time/time-utils";

/** A timesheet row: one project/sub-project + task + description, with its entries for the week. */
export interface Row {
  key: string;
  projectId: number;
  taskId: number | null;
  description: string;
  billable: boolean;
  color?: string | null;
  projectLabel: string;
  /** Sub-project (or project) name alone, for the dense grid. */
  leafLabel: string;
  taskLabel?: string | null;
  taskKey?: string | null;
  entries: TimeEntry[];
  /** Added with "Add row" and not saved yet. */
  draft?: boolean;
}

export const rowKey = (projectId: number, taskId: number | null | undefined, description: string) => `${projectId}|${taskId ?? 0}|${description.trim().toLowerCase()}`;

export function buildRows(entries: TimeEntry[], drafts: Row[], o: Options | undefined): Row[] {
  const map = new Map<string, Row>();
  for (const e of entries) {
    const k = rowKey(e.projectId, e.taskId, e.description);
    let r = map.get(k);
    if (!r) {
      const p = e.project;
      r = {
        key: k, projectId: e.projectId, taskId: e.taskId ?? null, description: e.description, billable: e.billable, color: p?.color,
        projectLabel: p?.parent ? `${p.parent.name} › ${p.name}` : p?.name ?? "", leafLabel: p?.name ?? "",
        taskLabel: e.task?.title ?? null, taskKey: e.task?.number ? `${o?.taskKey ?? "T"}-${e.task.number}` : null,
        entries: [],
      };
      map.set(k, r);
    }
    r.entries.push(e);
  }
  const rows = [...map.values()].sort((a, b) => a.projectLabel.localeCompare(b.projectLabel) || (a.taskLabel ?? "").localeCompare(b.taskLabel ?? "") || a.description.localeCompare(b.description));
  for (const d of drafts) if (!map.has(d.key) && !rows.some((r) => r.key === d.key)) rows.push(d);
  return rows;
}

export function draftRow(o: Options | undefined, projectId: number, taskId: number | null): Row {
  const p = o?.projects.find((x) => x.id === projectId);
  const parent = p?.parentId ? o?.projects.find((x) => x.id === p.parentId) : null;
  const t = p?.tasks.find((x) => x.id === taskId);
  const description = t?.title ?? "";
  return {
    key: `draft:${projectId}|${taskId ?? 0}|${Date.now()}`, projectId, taskId, description, billable: defaultBillable(p), color: p?.color,
    projectLabel: parent ? `${parent.name} › ${p!.name}` : p?.name ?? "", leafLabel: p?.name ?? "", taskLabel: t?.title ?? null, taskKey: t?.key ?? null, entries: [], draft: true,
  };
}

/** Full PUT body for an existing entry with some fields changed. */
export function entryBody(e: TimeEntry, patch: Partial<{ minutes: number; description: string; billable: boolean; keepTimes: boolean }> = {}) {
  const keepTimes = patch.keepTimes ?? patch.minutes === undefined;
  return {
    projectId: e.projectId, taskId: e.taskId ?? null, date: e.date,
    startTime: keepTimes ? e.startTime ?? null : null, endTime: keepTimes ? e.endTime ?? null : null,
    minutes: patch.minutes ?? e.minutes,
    description: patch.description ?? e.description, billable: patch.billable ?? e.billable,
  };
}
