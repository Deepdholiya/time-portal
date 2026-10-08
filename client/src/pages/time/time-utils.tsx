// Helpers shared by the Time tracker, entry dialog, Timesheet and Calendar pages.
import type { ComboboxOption } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { useApi } from "@/lib/hooks";
import type { Options, ProjectOption, TimeEntry } from "@/lib/types";

export const useOptions = () => useApi<Options>("/options");

export type EntryProject = NonNullable<TimeEntry["project"]>;

/** "Parent › Sub" for a sub-project, or just the project name. */
export function projectPath(p?: { name: string; parent?: { name: string } | null } | null) {
  if (!p) return "";
  return p.parent ? `${p.parent.name} › ${p.name}` : p.name;
}

export function optionPath(o: Options | undefined, id: number | null | undefined) {
  const p = o?.projects.find((x) => x.id === id);
  if (!p) return "";
  const parent = p.parentId ? o!.projects.find((x) => x.id === p.parentId) : null;
  return parent ? `${parent.name} › ${p.name}` : p.name;
}

export const taskKeyOf = (o: Options | undefined, number?: number | null) => (number ? `${o?.taskKey ?? "T"}-${number}` : "");

export const defaultBillable = (p?: ProjectOption | null) => (p ? p.billingType !== "NON_BILLABLE" : true);

/** Projects (and sub-projects, nested under their parent) the user can log time on, grouped by client. */
export function loggableProjects(o: Options | undefined) {
  if (!o) return [];
  const clients = new Map(o.clients.map((c) => [c.id, c.name]));
  const byId = new Map(o.projects.map((p) => [p.id, p]));
  const top = o.projects.filter((p) => !p.parentId).sort((a, b) => a.name.localeCompare(b.name));
  const out: { project: ProjectOption; parent: ProjectOption | null; client: string }[] = [];
  for (const t of top) {
    const kids = o.projects.filter((p) => p.parentId === t.id).sort((a, b) => a.name.localeCompare(b.name));
    const client = (t.clientId && clients.get(t.clientId)) || "No client";
    if (t.canLog) out.push({ project: t, parent: null, client });
    for (const k of kids) if (k.canLog) out.push({ project: k, parent: t, client });
  }
  // Sub-projects whose parent isn't listed (shouldn't happen, but keep them reachable).
  for (const p of o.projects) if (p.canLog && p.parentId && !byId.has(p.parentId)) out.push({ project: p, parent: null, client: "Other" });
  return out;
}

/** Combined project + task options for one-step pickers (tracker bar, timesheet "Add row"). Values: "p<id>" or "t<id>". */
export function projectTaskOptions(o: Options | undefined, withTasks = true): ComboboxOption[] {
  const out: ComboboxOption[] = [];
  for (const { project: p, parent, client } of loggableProjects(o)) {
    const path = parent ? `${parent.name} › ${p.name}` : p.name;
    out.push({ value: `p${p.id}`, label: path, group: client, icon: <ProjectDot color={p.color} />, keywords: p.code ?? "" });
    if (withTasks) {
      for (const t of p.tasks) {
        out.push({
          value: `t${t.id}`, label: t.title, group: client, keywords: `${path} ${t.key ?? ""}`,
          icon: <span style={{ width: 8, marginLeft: 6, borderLeft: "1px solid var(--border-strong)", height: 14, flexShrink: 0 }} />,
          hint: t.key,
        });
      }
    }
  }
  return out;
}

/** Resolve a "p12"/"t62" picker value to project and task ids. */
export function resolvePick(o: Options | undefined, v: string | null): { projectId: number | null; taskId: number | null } {
  if (!v) return { projectId: null, taskId: null };
  const id = Number(v.slice(1));
  if (v[0] === "p") return { projectId: id, taskId: null };
  const p = o?.projects.find((x) => x.tasks.some((t) => t.id === id));
  return { projectId: p?.id ?? null, taskId: id };
}

export const pickValue = (projectId?: number | null, taskId?: number | null) => (taskId ? `t${taskId}` : projectId ? `p${projectId}` : null);
