import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CircleDashed, Flag, FolderKanban, LayoutList, Milestone, SlidersHorizontal, Tag, UserRound, X, Columns3 } from "lucide-react";
import { FilterMenu } from "@/components/app/filter-menu";
import { Avatar, Button, Popover, SegmentedControl, Select, Switch } from "@/components/ui";
import { PRIORITIES, PRIORITY_META, PriorityIcon, ProjectDot, STATUSES, STATUS_META, StatusIcon } from "@/components/app/icons";
import { useDebounced } from "@/lib/hooks";
import type { Options } from "@/lib/types";
import { DUE_PRESETS, EMPTY_FILTERS, filtersActive, type GroupBy, type OrderBy, type TaskFilters } from "./lib";
import s from "./tasks.module.css";
import { SearchField } from "@/components/app/search-field";

export interface Display { view: "list" | "board"; groupBy: GroupBy; orderBy: OrderBy; showDone: boolean; showSubtasks: boolean }
export const DEFAULT_DISPLAY: Display = { view: "list", groupBy: "status", orderBy: "priority", showDone: true, showSubtasks: false };


export function TaskToolbar({ filters, setFilters, display, setDisplay, options, fixedProjectId, extra }: {
  filters: TaskFilters; setFilters: (f: TaskFilters) => void; display: Display; setDisplay: (d: Display) => void; options?: Options; fixedProjectId?: number; extra?: ReactNode;
}) {
  const [q, setQ] = useState(filters.q);
  const dq = useDebounced(q, 250);
  useEffect(() => { if (dq !== filters.q) setFilters({ ...filters, q: dq }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dq]);
  useEffect(() => { setQ(filters.q); }, [filters.q]);

  const users = options?.users ?? [];
  const projects = options?.projects ?? [];
  const topOf = (id: number) => projects.find((p) => p.id === id);
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name, group: p.parentId ? topOf(p.parentId)?.name ?? "Sub-projects" : undefined, icon: <ProjectDot color={p.color} /> }))
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? ""));
  const scope = fixedProjectId ?? filters.projectId;
  const milestones = projects.filter((p) => !scope || p.id === scope || p.parentId === scope).flatMap((p) => p.milestones.map((m) => ({ ...m, project: p.name })));
  const active = filtersActive(filters);


  return (
    <div className={s.toolbar}>
      <SearchField placeholder="Search tasks…" value={q} onChange={setQ} />
      {active && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setQ(""); setFilters({ ...EMPTY_FILTERS }); }}>Clear</Button>}
      <span className="grow" />
      <FilterMenu
        placement="bottom-start"
        sections={[
          ...(!fixedProjectId ? [{ key: "project", label: "Project", icon: <FolderKanban size={13} />, single: true, options: projectOpts.map((o) => ({ value: String(o.value), label: o.label, icon: o.icon, hint: o.group })) }] : []),
          { key: "assignee", label: "Assignee", icon: <UserRound size={13} />, options: [{ value: "me", label: "Me", icon: <UserRound size={14} /> }, { value: "none", label: "Unassigned", icon: <Avatar size={16} /> }, ...users.map((u) => ({ value: String(u.id), label: u.name, icon: <Avatar name={u.name} size={16} /> }))] },
          { key: "status", label: "Status", icon: <CircleDashed size={13} />, options: STATUSES.map((v) => ({ value: v, label: STATUS_META[v].label, icon: <StatusIcon status={v} /> })) },
          { key: "priority", label: "Priority", icon: <Flag size={13} />, options: PRIORITIES.map((v) => ({ value: v, label: PRIORITY_META[v].label, icon: <PriorityIcon priority={v} /> })) },
          ...(milestones.length ? [{ key: "milestone", label: "Milestone", icon: <Milestone size={13} />, single: true, options: milestones.map((m) => ({ value: String(m.id), label: m.name, hint: m.project })) }] : []),
          ...((options?.tags.length ?? 0) > 0 ? [{ key: "tag", label: "Tag", icon: <Tag size={13} />, single: true, options: (options?.tags ?? []).map((x) => ({ value: x, label: x })) }] : []),
          { key: "due", label: "Due", icon: <CalendarDays size={13} />, single: true, options: DUE_PRESETS.map((d) => ({ value: d.value, label: d.label })) },
        ]}
        value={{
          project: filters.projectId ? [String(filters.projectId)] : [], assignee: filters.assignee, status: filters.status, priority: filters.priority,
          milestone: filters.milestoneId ? [String(filters.milestoneId)] : [], tag: filters.tag ? [filters.tag] : [], due: filters.due ? [filters.due] : [],
        }}
        onApply={(v) => setFilters({
          ...filters,
          projectId: fixedProjectId ? filters.projectId : v.project?.[0] ? Number(v.project[0]) : null,
          assignee: v.assignee ?? [], status: (v.status ?? []) as TaskFilters["status"], priority: (v.priority ?? []) as TaskFilters["priority"],
          milestoneId: v.milestone?.[0] ? Number(v.milestone[0]) : null, tag: v.tag?.[0] ?? null, due: (v.due?.[0] ?? "") as TaskFilters["due"],
        })}
      />
      {extra}
      <Popover
        placement="bottom-end" padded={false}
        trigger={<Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />}>Display</Button>}
      >
        <div className={s.displayPanel}>
          {display.view === "list" && (
            <div className={s.displayRow}>
              <span>Grouping</span>
              <Select size="sm" fullWidth={false} value={display.groupBy} onChange={(v) => setDisplay({ ...display, groupBy: v as GroupBy })}
                options={[{ value: "status", label: "Status" }, { value: "project", label: "Project" }, { value: "assignee", label: "Assignee" }, { value: "priority", label: "Priority" }, { value: "none", label: "No grouping" }]} />
            </div>
          )}
          <div className={s.displayRow}>
            <span>Ordering</span>
            <Select size="sm" fullWidth={false} value={display.orderBy} onChange={(v) => setDisplay({ ...display, orderBy: v as OrderBy })}
              options={[{ value: "priority", label: "Priority" }, { value: "due", label: "Due date" }, { value: "updated", label: "Last updated" }, { value: "created", label: "Newest" }, { value: "manual", label: "Manual" }]} />
          </div>
          <div className={s.displayRow}><span>Show completed</span><Switch checked={display.showDone} onChange={(v) => setDisplay({ ...display, showDone: v })} aria-label="Show completed tasks" /></div>
          <div className={s.displayRow}><span>Show sub-tasks</span><Switch checked={display.showSubtasks} onChange={(v) => setDisplay({ ...display, showSubtasks: v })} aria-label="Show sub-tasks" /></div>
        </div>
      </Popover>
      <SegmentedControl
        aria-label="View" value={display.view} onChange={(v) => setDisplay({ ...display, view: v })}
        options={[{ value: "list", label: "List", icon: <LayoutList size={14} /> }, { value: "board", label: "Board", icon: <Columns3 size={14} /> }]}
      />
    </div>
  );
}
