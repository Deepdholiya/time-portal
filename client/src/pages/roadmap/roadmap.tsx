import { useMemo, useState } from "react";
import { Activity, Briefcase, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronsDownUp, ChevronsUpDown, Eye, Map as MapIcon, Plus, Rows3, Target, User, Users, ZoomIn } from "lucide-react";
import { Badge, Button, EmptyState, IconButton, Menu, SkeletonRows, Tooltip, toast } from "@/components/ui";
import { FilterMenu, type FilterSection, type FilterValues } from "@/components/app/filter-menu";
import { Page } from "@/components/app/page";
import { HEALTH_META, ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { patch } from "@/lib/api";
import { invalidate, useApi, useLocal } from "@/lib/hooks";
import { addDays, fmtDate, today } from "@/lib/format";
import type { Options } from "@/lib/types";
import { useMe } from "@/lib/session";
import { ProjectFormDialog } from "../projects/project-form";
import { PROJECT_STATUS } from "../projects/lib";
import { LoadError } from "../analytics/entries";
import { Gantt, type Target as BarTarget } from "./gantt";
import { ImpactDialog } from "./impact-dialog";
import { ZOOMS, type Zoom } from "./scale";
import type { Impact, RoadmapData, RProject, RTask, Row } from "./types";

type GroupBy = "initiative" | "status" | "lead" | "health" | "none";
const GROUPS: { value: GroupBy; label: string }[] = [{ value: "initiative", label: "Initiative" }, { value: "status", label: "Status" }, { value: "lead", label: "Lead" }, { value: "health", label: "Health" }, { value: "none", label: "No grouping" }];

interface RFilters { projectId: string[]; userId: string; teamId: string; health: string[]; status: string[]; initiativeId: string }
const EMPTY: RFilters = { projectId: [], userId: "", teamId: "", health: [], status: [], initiativeId: "" };

const minD = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort()[0] as string | undefined;
const maxD = (xs: (string | null | undefined)[]) => xs.filter(Boolean).sort().at(-1) as string | undefined;

export default function Roadmap() {
  const shell = useShell();
  const [zoom, setZoom] = useLocal<Zoom>("roadmap.zoom", "week");
  const [showTasks, setShowTasks] = useLocal("roadmap.tasks", true);
  const [f, setF] = useLocal<RFilters>("roadmap.filters", EMPTY);
  const filters = { ...EMPTY, ...f };
  const [collapsed, setCollapsed] = useLocal<string[]>("roadmap.collapsed", []);
  const [todayTick, setTodayTick] = useState(0);
  const { data, error, loading, reload, mutate } = useApi<RoadmapData>("/roadmap", {
    userId: filters.userId || undefined, teamId: filters.teamId || undefined, health: filters.health.join(",") || undefined,
    status: filters.status.join(",") || undefined, initiativeId: filters.initiativeId || undefined, tasks: showTasks ? "true" : "false",
  });
  const { data: opts } = useApi<Options>("/options");
  const { can } = useMe();
  const manage = can("projects", "manage");
  const canCreateTask = can("tasks", "create");
  const [groupBy, setGroupBy] = useLocal<GroupBy>("roadmap.groupBy", "initiative");
  const [creating, setCreating] = useState<boolean | string>(false);
  const [impact, setImpact] = useState<{ task: RTask; items: Impact[] } | null>(null);

  const projects = useMemo(() => (data?.projects ?? []).filter((p) => !filters.projectId.length || filters.projectId.includes(String(p.id))), [data, filters.projectId]);
  const closed = new Set(collapsed);
  const toggle = (k: string) => setCollapsed(closed.has(k) ? collapsed.filter((x) => x !== k) : [...collapsed, k]);

  // Group (by initiative, status, lead or health, like GitHub's roadmap Group by) → project → (milestones, tasks, sub-project → tasks),
  // with an "Add" row closing each project and each group.
  const rows = useMemo(() => {
    const out: Row[] = [];
    if (!data) return out;
    const STATUS_C: Record<string, string> = { PLANNING: "var(--text-3)", ACTIVE: "var(--blue)", ON_HOLD: "var(--yellow)", COMPLETED: "var(--green)" };
    const HEALTH_C: Record<string, string> = { ON_TRACK: "var(--green)", AT_RISK: "var(--yellow)", DELAYED: "var(--red)" };
    const groupOf = (p: RProject): { k: string; id: number | null; name: string; color: string; order: string } => {
      switch (groupBy) {
        case "status": return { k: `g${p.status}`, id: null, name: PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS]?.label ?? p.status, color: STATUS_C[p.status] ?? "var(--text-3)", order: String(["ACTIVE", "PLANNING", "ON_HOLD", "COMPLETED"].indexOf(p.status)) };
        case "lead": return { k: `g${p.manager?.id ?? 0}`, id: p.manager?.id ?? null, name: p.manager?.name ?? "No lead", color: "var(--text-3)", order: p.manager ? p.manager.name : "~" };
        case "health": return { k: `g${p.health}`, id: null, name: HEALTH_META[p.health]?.label ?? p.health, color: HEALTH_C[p.health] ?? "var(--text-3)", order: String(["DELAYED", "AT_RISK", "ON_TRACK"].indexOf(p.health)) };
        case "none": return { k: "gall", id: null, name: "All projects", color: "var(--text-3)", order: "" };
        default: return { k: p.initiative ? `i${p.initiative.id}` : "i0", id: p.initiative?.id ?? null, name: p.initiative?.name ?? "No initiative", color: p.initiative?.color ?? "var(--text-3)", order: p.initiative ? p.initiative.name : "~" };
      }
    };
    const groups = new Map<string, { id: number | null; name: string; color: string; order: string; list: RProject[] }>();
    for (const p of projects) {
      const g0 = groupOf(p);
      const g = groups.get(g0.k) ?? { ...g0, list: [] };
      g.list.push(p); groups.set(g0.k, g);
    }
    const tasksOf = (pid: number) => data.tasks.filter((t) => t.projectId === pid);
    for (const [k, g] of [...groups.entries()].sort((a, b) => a[1].order.localeCompare(b[1].order))) {
      const open = !closed.has(k);
      out.push({ kind: "initiative", key: k, id: g.id, name: g.name, color: g.color, count: g.list.length, start: minD(g.list.map((p) => p.startDate)) ?? null, end: maxD(g.list.map((p) => p.endDate)) ?? null, open });
      if (!open) continue;
      for (const p of g.list) {
        const pk = `p${p.id}`, popen = !closed.has(pk);
        out.push({ kind: "project", key: pk, project: p, open: popen, depth: 0 });
        if (!popen) continue;
        if (p.milestones.length) out.push({ kind: "milestones", key: `m${p.id}`, project: p });
        for (const t of tasksOf(p.id)) out.push({ kind: "task", key: `t${t.id}`, task: t, color: p.color, depth: 0 });
        for (const c of p.children) {
          const sk = `s${c.id}`, sopen = !closed.has(sk);
          const ts = tasksOf(c.id);
          out.push({ kind: "sub", key: sk, sub: c, parent: p, open: sopen, count: ts.length });
          if (sopen) for (const t of ts) out.push({ kind: "task", key: `t${t.id}`, task: t, color: p.color, depth: 1 });
        }
        if (canCreateTask && showTasks) out.push({ kind: "add", key: `at${p.id}`, what: "task", projectId: p.id, depth: 1 });
      }
      if (manage) out.push({ kind: "add", key: `ap${k}`, what: "project", groupId: groupBy === "initiative" && g.id ? String(g.id) : undefined, depth: 0 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, projects, collapsed, groupBy, showTasks]);

  // Timeline domain: everything visible plus some air, always including today.
  const { start, end } = useMemo(() => {
    const ds = [today(), ...projects.flatMap((p) => [p.startDate, p.endDate, ...p.children.flatMap((c) => [c.startDate, c.endDate]), ...p.milestones.map((m) => m.date)]), ...(data?.tasks ?? []).flatMap((t) => [t.startDate, t.dueDate])];
    const lo = minD(ds) ?? today(), hi = maxD(ds) ?? today();
    const pad = zoom === "day" ? 7 : zoom === "week" || zoom === "2week" ? 21 : 45;
    return { start: addDays(lo.slice(0, 8) + "01", -pad), end: addDays(hi, pad + 30) };
  }, [projects, data, zoom]);

  const collapseAll = () => setCollapsed(projects.map((p) => `p${p.id}`));
  const expandAll = () => setCollapsed([]);

  const commit = async (t: BarTarget, startDate: string | null, endDate: string | null) => {
    if (!data) return;
    // Optimistic move, then reload so health/conflicts are recomputed by the server.
    mutate((d) => {
      if (!d) return d!;
      if (t.kind === "task") return { ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, startDate, dueDate: endDate } : x)) };
      return { ...d, projects: d.projects.map((p) => p.id === t.id ? { ...p, startDate, endDate } : { ...p, children: p.children.map((c) => (c.id === t.id ? { ...c, startDate, endDate } : c)) }) };
    });
    try {
      if (t.kind === "task") {
        const r = await patch<{ impact?: Impact[] }>(`/tasks/${t.id}`, { startDate, dueDate: endDate });
        const task = data.tasks.find((x) => x.id === t.id)!;
        if (r.impact?.length) setImpact({ task, items: r.impact });
        else toast.success(`Moved ${task.key}`, { description: `${startDate ? fmtDate(startDate) + " → " : "Due "}${fmtDate(endDate)}` });
        invalidate("/tasks"); invalidate("/calendar"); invalidate("/my-tasks");
      } else {
        await patch(`/projects/${t.id}/dates`, { startDate, endDate });
        toast.success("Dates updated", { description: `${fmtDate(startDate, true)} → ${fmtDate(endDate, true)}` });
        invalidate("/projects");
      }
    } catch (e) {
      toast.error(e);
    }
    reload();
  };

  const conflicts = data?.dependencies.filter((d) => d.conflict).length ?? 0;
  const canEdit = !!data?.canEdit;
  const healthOpts = Object.entries(HEALTH_META).filter(([k]) => k !== "NONE").map(([k, v]) => ({ value: k, label: v.label }));
  const statusOpts = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase().replace("_", " ") }));
  const active = filters.projectId.length + filters.health.length + filters.status.length + (filters.userId ? 1 : 0) + (filters.teamId ? 1 : 0) + (filters.initiativeId ? 1 : 0);

  const sections: FilterSection[] = [
    { key: "show", label: "Show", icon: <Eye size={13} />, allByDefault: true, options: [{ value: "tasks", label: "Tasks with dates" }] },
    { key: "project", label: "Project", icon: <Briefcase size={13} />, options: (data?.projects ?? []).map((p) => ({ value: String(p.id), label: p.name, icon: <ProjectDot color={p.color} /> })) },
    { key: "initiative", label: "Initiative", icon: <Target size={13} />, single: true, options: (opts?.initiatives ?? data?.initiatives ?? []).map((i) => ({ value: String(i.id), label: i.name })) },
    { key: "employee", label: "Employee", icon: <User size={13} />, single: true, options: (opts?.users ?? []).map((u) => ({ value: String(u.id), label: u.name })) },
    { key: "team", label: "Team", icon: <Users size={13} />, single: true, options: (opts?.teams ?? []).map((x) => ({ value: String(x.id), label: x.name })) },
    { key: "health", label: "Health", icon: <Activity size={13} />, options: healthOpts },
    { key: "status", label: "Status", icon: <CheckCircle2 size={13} />, options: statusOpts },
  ];
  const fv: FilterValues = {
    show: showTasks ? ["tasks"] : [], project: filters.projectId, initiative: filters.initiativeId ? [filters.initiativeId] : [], employee: filters.userId ? [filters.userId] : [],
    team: filters.teamId ? [filters.teamId] : [], health: filters.health, status: filters.status,
  };
  const applyFilters = (v: FilterValues) => {
    setShowTasks((v.show ?? []).includes("tasks"));
    setF({ projectId: v.project ?? [], initiativeId: v.initiative?.[0] ?? "", userId: v.employee?.[0] ?? "", teamId: v.team?.[0] ?? "", health: v.health ?? [], status: v.status ?? [] });
  };

  return (
    <Page
      title="Roadmap" icon={<MapIcon size={15} />}
      actions={
        <div className="row gap-4">
          {!canEdit && data && <Badge size="sm" icon={<Eye size={11} />}>Read-only</Badge>}
          {conflicts > 0 && <Tooltip content="Tasks that start before a blocking task is due"><span><Badge size="sm" tone="red" dot>{conflicts} dependency conflict{conflicts > 1 ? "s" : ""}</Badge></span></Tooltip>}
          {manage && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Add project</Button>}
        </div>
      }
      toolbar={
        <>
          <Button size="sm" variant="secondary" icon={<CalendarDays size={14} />} onClick={() => setTodayTick((n) => n + 1)}>Today</Button>
          <Tooltip content={collapsed.length ? "Expand all" : "Collapse projects"}>
            <IconButton size="sm" variant="secondary" label="Expand or collapse all" icon={collapsed.length ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />} onClick={collapsed.length ? expandAll : collapseAll} />
          </Tooltip>
          <FilterMenu placement="bottom-start" sections={sections} value={fv} onApply={applyFilters} />
          {canEdit && <span className="small faint hide-sm">Drag a bar to move its dates, or its edge to change the length.</span>}
          <span className="grow" />
          <Menu trigger={<Button size="sm" variant="secondary" icon={<Rows3 size={14} />} iconRight={<ChevronDown size={13} />}>Group: {GROUPS.find((g) => g.value === groupBy)?.label}</Button>}
            items={GROUPS.map((g) => ({ label: g.label, icon: g.value === groupBy ? <Check size={14} /> : <span style={{ width: 14 }} />, onSelect: () => { setGroupBy(g.value); setCollapsed([]); } }))} />
          <Menu trigger={<Button size="sm" variant="secondary" icon={<ZoomIn size={14} />} iconRight={<ChevronDown size={13} />}>Zoom: {ZOOMS.find((z) => z.value === zoom)?.label}</Button>}
            items={ZOOMS.map((z) => ({ label: z.title, icon: z.value === zoom ? <Check size={14} /> : <span style={{ width: 14 }} />, onSelect: () => setZoom(z.value) }))} />
        </>
      }
    >
      {error ? <LoadError error={error} onRetry={reload} what="the roadmap" /> : loading && !data ? <SkeletonRows rows={12} /> : !rows.length ? (
        <EmptyState icon={<MapIcon size={28} />} title="Nothing on the roadmap" description={active ? "No projects match these filters." : "Each project shows as a bar from its start to its target date, with its milestones and dated tasks underneath."}
          action={active ? <Button size="sm" variant="secondary" onClick={() => setF(EMPTY)}>Clear filters</Button> : manage ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Add project</Button> : undefined} />
      ) : (
        <Gantt rows={rows} zoom={zoom} start={start} end={end} canEdit={canEdit} deps={data?.dependencies ?? []} scrollToToday={todayTick}
          onToggle={toggle} onCommit={commit} onOpenTask={(id) => shell.openTask(id)}
          onAdd={(r) => { if (r.what === "task") shell.newTask({ projectId: r.projectId }, () => reload()); else setCreating(r.groupId ?? true); }} />
      )}
      {creating && <ProjectFormDialog withDates initiativeId={typeof creating === "string" ? Number(creating) : undefined} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      <ImpactDialog value={impact} onClose={() => setImpact(null)} onShifted={() => { reload(); invalidate("/tasks"); }} />
    </Page>
  );
}
