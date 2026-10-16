import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { Button, EmptyState, ErrorState, SkeletonRows, toast } from "@/components/arc";
import { useShell, type NewTaskDefaults } from "@/components/app/shell-context";
import { useApi, useHotkey, useLocal } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import type { TaskStatus } from "@/lib/types";
import { BulkBar } from "./bulk-bar";
import { buildQuery, EMPTY_FILTERS, filtersActive, groupTasks, patchTask, sortTasks, useOptions, type ListTask, type TaskFilters } from "./lib";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import { DEFAULT_DISPLAY, TaskToolbar, type Display } from "./task-toolbar";

export interface TaskViewProps {
  storageKey: string;
  fixedProjectId?: number;
  newDefaults?: NewTaskDefaults;
  toolbarExtra?: ReactNode;
  showProject?: boolean;
}

/** Toolbar + scrollable body (fills a .page column): List/Board task view with filters, grouping, inline edits, bulk actions and drag-and-drop. */
export function TaskView({ storageKey, fixedProjectId, newDefaults, toolbarExtra, showProject = true }: TaskViewProps) {
  const { me, can } = useMe();
  const shell = useShell();
  const canManage = can("tasks", "manage");
  const canCreate = can("tasks", "create");
  const [filters, setFilters] = useLocal<TaskFilters>(`${storageKey}:filters`, EMPTY_FILTERS);
  const [display, setDisplay] = useLocal<Display>(`${storageKey}:display`, DEFAULT_DISPLAY);
  const f = { ...EMPTY_FILTERS, ...filters };
  const d = { ...DEFAULT_DISPLAY, ...display };
  const opts = useOptions();
  const { query, keep } = buildQuery(f, me.user.id, { showDone: d.view === "board" || d.showDone, showSubtasks: d.showSubtasks, fixedProjectId });
  const tasksQ = useApi<ListTask[]>("/tasks", query);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<number | null>(null);

  const visible = useMemo(() => sortTasks((tasksQ.data ?? []).filter(keep), d.orderBy), [tasksQ.data, d.orderBy, keep]);
  const groups = useMemo(() => groupTasks(visible, d.groupBy, { showEmptyStatuses: false, showDone: d.showDone }), [visible, d.groupBy, d.showDone]);
  const flat = groups.flatMap((g) => g.tasks);

  const onPatch = async (task: ListTask, body: Record<string, unknown>) => {
    const prev = tasksQ.data;
    tasksQ.mutate((list) => (list ?? []).map((t) => (t.id === task.id ? { ...t, ...body, ...(body.assigneeId !== undefined ? { assignee: opts.data?.users.find((u) => u.id === body.assigneeId) ?? null } : {}) } as ListTask : t)));
    try {
      const r = await patchTask(task.id, body);
      if (r.impact?.length) toast.info(`${r.impact.length} dependent task${r.impact.length > 1 ? "s" : ""} now conflict`, { action: { label: "Open", onClick: () => shell.openTask(task.id) } });
    } catch (e) {
      if (prev) tasksQ.mutate(prev);
      toast.error(e);
    }
  };

  const onAdd = (defaults: Record<string, unknown>) => {
    shell.newTask({ ...newDefaults, ...(fixedProjectId ? { projectId: fixedProjectId } : f.projectId ? { projectId: f.projectId } : {}), ...defaults } as NewTaskDefaults, () => tasksQ.reload());
  };

  const onSelect = (ids: number[], on: boolean) => setSelected((s) => { const n = new Set(s); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; });

  // Keyboard: j/k move, Enter opens, x selects, Escape clears selection.
  const move = (dir: number) => {
    if (!flat.length) return;
    const i = flat.findIndex((t) => t.id === focus);
    const next = flat[Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + dir))];
    setFocus(next.id);
    document.querySelector(`[data-task-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
  };
  useHotkey("j", () => move(1), { enabled: d.view === "list" });
  useHotkey("k", () => move(-1), { enabled: d.view === "list" });
  useHotkey("arrowdown", () => move(1), { enabled: d.view === "list" });
  useHotkey("arrowup", () => move(-1), { enabled: d.view === "list" });
  useHotkey("enter", () => focus && shell.openTask(focus), { enabled: d.view === "list" && !!focus });
  useHotkey("x", () => focus && canManage && onSelect([focus], !selected.has(focus)), { enabled: d.view === "list" && !!focus });
  useHotkey("escape", () => setSelected(new Set()), { enabled: selected.size > 0 });

  const toolbar = (
    <TaskToolbar filters={f} setFilters={(x) => { setFilters(x); setSelected(new Set()); }} display={d} setDisplay={setDisplay} options={opts.data} fixedProjectId={fixedProjectId} extra={toolbarExtra} />
  );

  let body: ReactNode;
  if (tasksQ.error && !tasksQ.data) body = <ErrorState error={tasksQ.error} onRetry={tasksQ.reload} />;
  else if (!tasksQ.data) body = <SkeletonRows rows={10} />;
  else if (!visible.length) {
    body = filtersActive(f)
      ? <EmptyState title="No tasks match these filters" description="Try removing a filter or searching for something else." action={<Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Clear filters</Button>} />
      : <EmptyState icon={<CheckCircle2 size={28} />} title="No tasks yet" description="Tasks you create or that are assigned to you show up here." action={canCreate ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => onAdd({})}>New task</Button> : undefined} />;
  } else if (d.view === "board") {
    body = <TaskBoard tasks={visible} meId={me.user.id} canManage={canManage} canCreate={canCreate} onOpen={shell.openTask} onMove={(t, status: TaskStatus) => onPatch(t, { status })} onAdd={onAdd} showProject={showProject} />;
  } else {
    body = (
      <TaskList
        groups={groups} storageKey={storageKey} users={opts.data?.users ?? []} meId={me.user.id} canManage={canManage} canCreate={canCreate}
        selected={selected} onSelect={onSelect} onOpen={(id) => { setFocus(id); shell.openTask(id); }} onPatch={onPatch} onAdd={onAdd} showProject={showProject} focusedId={focus}
      />
    );
  }

  return (
    <>
      <div className="page-toolbar">{toolbar}</div>
      <div className="page-body">{body}</div>
      {canManage && (
        <BulkBar ids={[...selected].filter((id) => visible.some((t) => t.id === id))} users={opts.data?.users ?? []} onClear={() => setSelected(new Set())} onDone={() => { setSelected(new Set()); tasksQ.reload(); }} />
      )}
    </>
  );
}
