import type { Options, TimeEntry } from "@/lib/types";
import { defaultBillable } from "../time/time-utils";

/** A timesheet row: one project (or sub-project) and task, with every entry for it in the range. A day can hold several entries. */
export interface Row {
  key: string;
  projectId: number;
  taskId: number | null;
  billable: boolean;
  color?: string | null;
  projectLabel: string;
  /** Sub-project (or project) name alone, for the dense grid. */
  leafLabel: string;
  parentLabel?: string | null;
  taskLabel?: string | null;
  taskKey?: string | null;
  entries: TimeEntry[];
  /** Added with "Add row" and not saved yet. */
  draft?: boolean;
}

export const rowKey = (projectId: number, taskId: number | null | undefined) => `${projectId}|${taskId ?? 0}`;

export function buildRows(entries: TimeEntry[], drafts: Row[], o: Options | undefined): Row[] {
  const map = new Map<string, Row>();
  for (const e of entries) {
    const k = rowKey(e.projectId, e.taskId);
    let r = map.get(k);
    if (!r) {
      const p = e.project;
      r = {
        key: k, projectId: e.projectId, taskId: e.taskId ?? null, billable: e.billable, color: p?.color,
        projectLabel: p?.parent ? `${p.parent.name} › ${p.name}` : p?.name ?? "", leafLabel: p?.name ?? "", parentLabel: p?.parent?.name ?? null,
        taskLabel: e.task?.title ?? null, taskKey: e.task?.number ? `${o?.taskKey ?? "T"}-${e.task.number}` : null,
        entries: [],
      };
      map.set(k, r);
    }
    r.entries.push(e);
  }
  for (const r of map.values()) r.billable = r.entries.some((e) => e.billable);
  const rows = [...map.values()].sort((a, b) => a.projectLabel.localeCompare(b.projectLabel) || (a.taskLabel ?? "").localeCompare(b.taskLabel ?? ""));
  for (const d of drafts) if (!map.has(d.key)) rows.push(d);
  return rows;
}

export function draftRow(o: Options | undefined, projectId: number, taskId: number | null): Row {
  const p = o?.projects.find((x) => x.id === projectId);
  const parent = p?.parentId ? o?.projects.find((x) => x.id === p.parentId) : null;
  const t = p?.tasks.find((x) => x.id === taskId);
  return {
    key: rowKey(projectId, taskId), projectId, taskId, billable: defaultBillable(p), color: p?.color,
    projectLabel: parent ? `${parent.name} › ${p!.name}` : p?.name ?? "", leafLabel: p?.name ?? "", parentLabel: parent?.name ?? null,
    taskLabel: t?.title ?? null, taskKey: t?.key ?? null, entries: [], draft: true,
  };
}

/** Full PUT body for an existing entry with some fields changed. The start stays put; the server works out the new end. */
export function entryBody(e: TimeEntry, patch: Partial<{ minutes: number; billable: boolean }> = {}) {
  return {
    projectId: e.projectId, taskId: e.taskId ?? null, date: e.date,
    startTime: e.startTime ?? null, endTime: patch.minutes === undefined ? e.endTime ?? null : null,
    minutes: patch.minutes ?? (e.startTime && e.endTime ? null : e.minutes),
    description: e.description, billable: patch.billable ?? e.billable, tagIds: e.tags.map((t) => t.id),
  };
}
