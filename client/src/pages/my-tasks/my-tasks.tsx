import { useMemo } from "react";
import { CheckCircle2, Columns3, LayoutList, Plus, UserRound } from "lucide-react";
import { Button, EmptyState, ErrorState, Select, SegmentedControl, SkeletonRows, Switch, Tabs, toast } from "@/components/ui";
import { STATUSES, STATUS_META } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { useApi, useLocal } from "@/lib/hooks";
import { addDays, today, weekStart } from "@/lib/format";
import { useMe } from "@/lib/session";
import { patchTask, sortTasks, useOptions, type Group, type ListTask } from "../tasks/lib";
import { TaskList } from "../tasks/task-list";
import { TaskBoard } from "../tasks/task-board";

type Tab = "assigned" | "created" | "following";
type GroupMode = "due" | "status";

const TAB_QUERY: Record<Tab, Record<string, string>> = {
  assigned: { assigneeId: "me" },
  created: { creatorId: "me" },
  following: { following: "true" },
};

function dueGroups(list: ListTask[]): Group[] {
  const t = today();
  const weekEnd = addDays(weekStart(t), 6);
  const buckets: { key: string; label: string; test: (x: ListTask) => boolean }[] = [
    { key: "overdue", label: "Overdue", test: (x) => x.status !== "DONE" && !!x.dueDate && x.dueDate < t },
    { key: "today", label: "Today", test: (x) => x.status !== "DONE" && x.dueDate === t },
    { key: "week", label: "This week", test: (x) => x.status !== "DONE" && !!x.dueDate && x.dueDate > t && x.dueDate <= weekEnd },
    { key: "later", label: "Later", test: (x) => x.status !== "DONE" && !!x.dueDate && x.dueDate > weekEnd },
    { key: "nodate", label: "No due date", test: (x) => x.status !== "DONE" && !x.dueDate },
    { key: "done", label: "Completed", test: (x) => x.status === "DONE" },
  ];
  return buckets.map((b) => ({ key: b.key, label: b.label, tasks: list.filter(b.test), defaults: b.key === "today" ? { dueDate: t } : {} })).filter((g) => g.tasks.length);
}

/** Linear "My issues": what's assigned to me, what I created, what I follow. */
export default function MyTasks() {
  const { me, can } = useMe();
  const shell = useShell();
  const opts = useOptions();
  const [tab, setTab] = useLocal<Tab>("my-tasks:tab", "assigned");
  const [mode, setMode] = useLocal<GroupMode>("my-tasks:group", "due");
  const [view, setView] = useLocal<"list" | "board">("my-tasks:view", "list");
  const [showDone, setShowDone] = useLocal("my-tasks:done", false);
  const q = useApi<ListTask[]>("/tasks", { ...TAB_QUERY[tab], parent: "all", includeDone: showDone || view === "board" ? "true" : "false" });

  // Older servers ignore creatorId/following; the per-task flags keep those tabs honest either way.
  const list = useMemo(() => {
    const all = q.data ?? [];
    const scoped = tab === "created" ? all.filter((t) => t.creatorId === me.user.id) : tab === "following" ? all.filter((t) => t.followed === true) : all;
    return sortTasks(scoped, mode === "due" ? "due" : "priority");
  }, [q.data, tab, mode, me.user.id]);

  const groups = useMemo<Group[]>(() => (mode === "due" ? dueGroups(list)
    : STATUSES.map((st) => ({ key: st, label: STATUS_META[st].label, status: st, tasks: list.filter((t) => t.status === st), defaults: { status: st } })).filter((g) => g.tasks.length)), [list, mode]);

  const onPatch = async (task: ListTask, body: Record<string, unknown>) => {
    const prev = q.data;
    q.mutate((l) => (l ?? []).map((t) => (t.id === task.id ? ({ ...t, ...body } as ListTask) : t)));
    try { await patchTask(task.id, body); } catch (e) { if (prev) q.mutate(prev); toast.error(e); }
  };
  const add = (defaults: Record<string, unknown>) => shell.newTask({ assigneeId: me.user.id, ...defaults }, () => q.reload());
  const canManage = can("tasks", "manage");
  const counts = q.data ? list.filter((t) => t.status !== "DONE").length : undefined;

  let body;
  if (q.error && !q.data) body = <ErrorState error={q.error} onRetry={q.reload} />;
  else if (!q.data) body = <SkeletonRows rows={10} />;
  else if (!list.length) {
    body = (
      <EmptyState
        icon={<CheckCircle2 size={28} />}
        title={tab === "assigned" ? "Nothing assigned to you" : tab === "created" ? "You haven't created any tasks" : "You're not following any tasks"}
        description={tab === "following" ? "Follow a task from its detail panel to see updates here." : showDone ? undefined : "Completed tasks are hidden. Turn on “Show completed” to see them."}
        action={can("tasks", "create") ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => add({})}>New task</Button> : undefined}
      />
    );
  } else if (view === "board") {
    body = <TaskBoard tasks={list} meId={me.user.id} canManage={canManage} canCreate={can("tasks", "create")} onOpen={shell.openTask} onMove={(t, status) => onPatch(t, { status })} onAdd={add} />;
  } else {
    body = (
      <TaskList
        groups={groups} storageKey={`my-tasks:${tab}:${mode}`} users={opts.data?.users ?? []} meId={me.user.id} canManage={canManage} selectable={false} canCreate={can("tasks", "create")}
        selected={new Set()} onSelect={() => undefined} onOpen={shell.openTask} onPatch={onPatch} onAdd={add}
      />
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1><UserRound size={15} className="faint" />My tasks</h1>
        <div className="grow" />
        {can("tasks", "create") && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => add({})}>New task</Button>}
      </header>
      <div className="page-toolbar">
        <Tabs
          value={tab} onChange={(v) => setTab(v as Tab)}
          items={[{ value: "assigned", label: "Assigned", count: tab === "assigned" ? counts : undefined }, { value: "created", label: "Created", count: tab === "created" ? counts : undefined }, { value: "following", label: "Following", count: tab === "following" ? counts : undefined }]}
        />
        <span className="grow" />
        {view === "list" && (
          <Select size="sm" fullWidth={false} value={mode} onChange={(v) => setMode(v as GroupMode)} aria-label="Group by"
            options={[{ value: "due", label: "Group by due date" }, { value: "status", label: "Group by status" }]} />
        )}
        {view === "list" && <Switch checked={showDone} onChange={setShowDone} label={<span className="small muted">Show completed</span>} />}
        <SegmentedControl aria-label="View" value={view} onChange={setView}
          options={[{ value: "list", label: "List", icon: <LayoutList size={14} /> }, { value: "board", label: "Board", icon: <Columns3 size={14} /> }]} />
      </div>
      <div className="page-body">{body}</div>
    </div>
  );
}
