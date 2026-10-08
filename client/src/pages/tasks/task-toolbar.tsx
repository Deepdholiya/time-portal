import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CalendarDays, CircleDashed, Flag, FolderKanban, LayoutList, Milestone, Search, SlidersHorizontal, Tag, UserRound, X, Columns3 } from "lucide-react";
import { Avatar, Button, Combobox, Input, Menu, Popover, SegmentedControl, Select, Switch } from "@/components/ui";
import { PRIORITIES, PRIORITY_META, PriorityIcon, ProjectDot, STATUSES, STATUS_META, StatusIcon } from "@/components/app/icons";
import { useDebounced } from "@/lib/hooks";
import type { Options } from "@/lib/types";
import { DUE_PRESETS, EMPTY_FILTERS, filtersActive, type GroupBy, type OrderBy, type TaskFilters } from "./lib";
import s from "./tasks.module.css";

export interface Display { view: "list" | "board"; groupBy: GroupBy; orderBy: OrderBy; showDone: boolean; showSubtasks: boolean }
export const DEFAULT_DISPLAY: Display = { view: "list", groupBy: "status", orderBy: "priority", showDone: true, showSubtasks: false };

/** Filter chip; forwards the popover trigger's ref and handlers so it can open a picker. */
const Chip = forwardRef<HTMLButtonElement, { active: boolean; icon: ReactNode; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>>(function Chip({ active, icon, children, ...rest }, ref) {
  return <button ref={ref} type="button" {...rest} className={`${s.filterChip} ${active ? s.active : ""}`}>{icon}{children}</button>;
});

const summary = (labels: string[], none: string) => (labels.length === 0 ? none : labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`);

export function TaskToolbar({ filters, setFilters, display, setDisplay, options, fixedProjectId, extra }: {
  filters: TaskFilters; setFilters: (f: TaskFilters) => void; display: Display; setDisplay: (d: Display) => void; options?: Options; fixedProjectId?: number; extra?: ReactNode;
}) {
  const [q, setQ] = useState(filters.q);
  const dq = useDebounced(q, 250);
  useEffect(() => { if (dq !== filters.q) setFilters({ ...filters, q: dq }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dq]);
  useEffect(() => { setQ(filters.q); }, [filters.q]);

  const set = <K extends keyof TaskFilters>(k: K, v: TaskFilters[K]) => setFilters({ ...filters, [k]: v });
  const users = options?.users ?? [];
  const projects = options?.projects ?? [];
  const topOf = (id: number) => projects.find((p) => p.id === id);
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name, group: p.parentId ? topOf(p.parentId)?.name ?? "Sub-projects" : undefined, icon: <ProjectDot color={p.color} /> }))
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? ""));
  const scope = fixedProjectId ?? filters.projectId;
  const milestones = projects.filter((p) => !scope || p.id === scope || p.parentId === scope).flatMap((p) => p.milestones.map((m) => ({ ...m, project: p.name })));
  const active = filtersActive(filters);

  const assigneeLabels = filters.assignee.map((a) => (a === "me" ? "Me" : a === "none" ? "Unassigned" : users.find((u) => String(u.id) === a)?.name ?? "?"));
  const dueLabel = DUE_PRESETS.find((d) => d.value === filters.due)?.label;

  return (
    <div className={s.toolbar}>
      <Input size="sm" className={s.search} icon={<Search size={14} />} placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
      {!fixedProjectId && (
        <Combobox
          value={filters.projectId} clearable clearLabel="Any project" width={260} searchPlaceholder="Project…"
          options={projectOpts} onChange={(v) => setFilters({ ...filters, projectId: v ? Number(v) : null, milestoneId: null })}
          trigger={<Chip active={!!filters.projectId} icon={<FolderKanban size={13} />}>{filters.projectId ? topOf(filters.projectId)?.name ?? "Project" : "Project"}</Chip>}
        />
      )}
      <Combobox
        multiple value={filters.assignee} width={240} searchPlaceholder="Assignee…"
        options={[{ value: "me", label: "Me", icon: <UserRound size={14} /> }, { value: "none", label: "Unassigned", icon: <Avatar size={16} /> }, ...users.map((u) => ({ value: String(u.id), label: u.name, icon: <Avatar name={u.name} size={16} /> }))]}
        onChange={(v) => set("assignee", v)}
        trigger={<Chip active={filters.assignee.length > 0} icon={<UserRound size={13} />}>{summary(assigneeLabels, "Assignee")}</Chip>}
      />
      <Combobox
        multiple value={filters.status} width={200} searchPlaceholder="Status…"
        options={STATUSES.map((v) => ({ value: v, label: STATUS_META[v].label, icon: <StatusIcon status={v} /> }))}
        onChange={(v) => set("status", v as TaskFilters["status"])}
        trigger={<Chip active={filters.status.length > 0} icon={<CircleDashed size={13} />}>{summary(filters.status.map((x) => STATUS_META[x].label), "Status")}</Chip>}
      />
      <Combobox
        multiple value={filters.priority} width={190} searchPlaceholder="Priority…"
        options={PRIORITIES.map((v) => ({ value: v, label: PRIORITY_META[v].label, icon: <PriorityIcon priority={v} /> }))}
        onChange={(v) => set("priority", v as TaskFilters["priority"])}
        trigger={<Chip active={filters.priority.length > 0} icon={<Flag size={13} />}>{summary(filters.priority.map((x) => PRIORITY_META[x].label), "Priority")}</Chip>}
      />
      {milestones.length > 0 && (
        <Combobox
          value={filters.milestoneId} clearable clearLabel="Any milestone" width={260} searchPlaceholder="Milestone…"
          options={milestones.map((m) => ({ value: m.id, label: m.name, hint: m.project }))}
          onChange={(v) => set("milestoneId", v ? Number(v) : null)}
          trigger={<Chip active={!!filters.milestoneId} icon={<Milestone size={13} />}>{milestones.find((m) => m.id === filters.milestoneId)?.name ?? "Milestone"}</Chip>}
        />
      )}
      {(options?.tags.length ?? 0) > 0 && (
        <Combobox
          value={filters.tag} clearable clearLabel="Any tag" width={200} searchPlaceholder="Tag…"
          options={(options?.tags ?? []).map((t) => ({ value: t, label: t }))}
          onChange={(v) => set("tag", v)}
          trigger={<Chip active={!!filters.tag} icon={<Tag size={13} />}>{filters.tag ?? "Tag"}</Chip>}
        />
      )}
      <Menu
        trigger={<Chip active={!!filters.due} icon={<CalendarDays size={13} />}>{dueLabel ?? "Due"}</Chip>}
        items={[{ label: "Any time", onSelect: () => set("due", ""), checked: !filters.due }, { type: "separator" }, ...DUE_PRESETS.map((d) => ({ label: d.label, onSelect: () => set("due", d.value), checked: filters.due === d.value }))]}
      />
      {active && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setQ(""); setFilters({ ...EMPTY_FILTERS }); }}>Clear</Button>}
      <span className="grow" />
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
