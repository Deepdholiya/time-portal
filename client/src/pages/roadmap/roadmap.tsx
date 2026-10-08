import { useMemo, useState } from "react";
import { Activity, Briefcase, CalendarDays, CheckCircle2, ChevronsDownUp, ChevronsUpDown, Eye, Map as MapIcon, Target, User, Users } from "lucide-react";
import { Badge, Button, EmptyState, SegmentedControl, SkeletonRows, Switch, Tooltip, toast } from "@/components/arc";
import { Page } from "@/components/app/page";
import { HEALTH_META, ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { patch } from "@/lib/api";
import { invalidate, useApi, useLocal } from "@/lib/hooks";
import { addDays, fmtDate, today } from "@/lib/format";
import type { Options } from "@/lib/types";
import { MultiChip, SingleChip } from "../analytics/filter-bar";
import { LoadError } from "../analytics/entries";
import { Gantt, type Target as BarTarget } from "./gantt";
import { ImpactDialog } from "./impact-dialog";
import { ZOOMS, type Zoom } from "./scale";
import type { Impact, RoadmapData, RProject, RTask, Row } from "./types";
import s from "./roadmap.module.css";

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
  const [impact, setImpact] = useState<{ task: RTask; items: Impact[] } | null>(null);

  const projects = useMemo(() => (data?.projects ?? []).filter((p) => !filters.projectId.length || filters.projectId.includes(String(p.id))), [data, filters.projectId]);
  const closed = new Set(collapsed);
  const toggle = (k: string) => setCollapsed(closed.has(k) ? collapsed.filter((x) => x !== k) : [...collapsed, k]);

  // Flatten initiative → project → (milestones, project tasks, sub-project → tasks) into visible rows.
  const rows = useMemo(() => {
    const out: Row[] = [];
    if (!data) return out;
    const byInit = new Map<string, { id: number | null; name: string; color: string; list: RProject[] }>();
    for (const p of projects) {
      const k = p.initiative ? `i${p.initiative.id}` : "i0";
      const g = byInit.get(k) ?? { id: p.initiative?.id ?? null, name: p.initiative?.name ?? "No initiative", color: p.initiative?.color ?? "var(--text-3)", list: [] };
      g.list.push(p); byInit.set(k, g);
    }
    const tasksOf = (pid: number) => data.tasks.filter((t) => t.projectId === pid);
    for (const [k, g] of [...byInit.entries()].sort((a, b) => (a[1].id === null ? 1 : b[1].id === null ? -1 : a[1].name.localeCompare(b[1].name)))) {
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
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, projects, collapsed]);

  // Timeline domain: everything visible plus some air, always including today.
  const { start, end } = useMemo(() => {
    const ds = [today(), ...projects.flatMap((p) => [p.startDate, p.endDate, ...p.children.flatMap((c) => [c.startDate, c.endDate]), ...p.milestones.map((m) => m.date)]), ...(data?.tasks ?? []).flatMap((t) => [t.startDate, t.dueDate])];
    const lo = minD(ds) ?? today(), hi = maxD(ds) ?? today();
    const pad = zoom === "day" ? 7 : zoom === "week" || zoom === "2week" ? 21 : 45;
    return { start: addDays(lo.slice(0, 8) + "01", -pad), end: addDays(hi, pad + 30) };
  }, [projects, data, zoom]);

  const allKeys = rows.filter((r) => r.kind !== "task" && r.kind !== "milestones").map((r) => r.key);
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
  const statusOpts = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED"].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase().replace("_", " ") }));
  const active = filters.projectId.length + filters.health.length + filters.status.length + (filters.userId ? 1 : 0) + (filters.teamId ? 1 : 0) + (filters.initiativeId ? 1 : 0);

  return (
    <Page
      title="Roadmap" icon={<MapIcon size={15} />}
      actions={
        <div className="row gap-4">
          {!canEdit && data && <Badge size="sm" icon={<Eye size={11} />}>Read-only</Badge>}
          {conflicts > 0 && <Tooltip content="Tasks that start before a blocking task is due"><span><Badge size="sm" tone="red" dot>{conflicts} dependency conflict{conflicts > 1 ? "s" : ""}</Badge></span></Tooltip>}
          <Button size="sm" variant="ghost" icon={<CalendarDays size={14} />} onClick={() => setTodayTick((n) => n + 1)}>Today</Button>
          <Tooltip content={collapsed.length ? "Expand all" : "Collapse projects"}>
            <Button size="sm" variant="ghost" icon={collapsed.length ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />} onClick={collapsed.length ? expandAll : collapseAll} aria-label="Toggle all" />
          </Tooltip>
        </div>
      }
      toolbar={
        <div className="row wrap" style={{ width: "100%" }}>
          <SegmentedControl aria-label="Zoom" value={zoom} onChange={setZoom} options={ZOOMS.map((z) => ({ value: z.value, label: z.label, title: z.title }))} />
          <span className={s.vsep} />
          <MultiChip icon={<Briefcase size={13} />} label="Project" value={filters.projectId} onChange={(projectId) => setF({ ...filters, projectId })}
            options={(data?.projects ?? []).map((p) => ({ value: String(p.id), label: p.name, icon: <ProjectDot color={p.color} /> }))} />
          <SingleChip icon={<Target size={13} />} label="Initiative" value={filters.initiativeId} onChange={(initiativeId) => setF({ ...filters, initiativeId })}
            options={(opts?.initiatives ?? data?.initiatives ?? []).map((i) => ({ value: String(i.id), label: i.name }))} />
          <SingleChip icon={<User size={13} />} label="Employee" value={filters.userId} onChange={(userId) => setF({ ...filters, userId })}
            options={(opts?.users ?? []).map((u) => ({ value: String(u.id), label: u.name }))} />
          <SingleChip icon={<Users size={13} />} label="Team" value={filters.teamId} onChange={(teamId) => setF({ ...filters, teamId })}
            options={(opts?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name }))} />
          <MultiChip icon={<Activity size={13} />} label="Health" value={filters.health} onChange={(health) => setF({ ...filters, health })} options={healthOpts} />
          <MultiChip icon={<CheckCircle2 size={13} />} label="Status" value={filters.status} onChange={(status) => setF({ ...filters, status })} options={statusOpts} />
          {active > 0 && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY)}>Clear</Button>}
          <div className="grow" />
          <Switch checked={showTasks} onChange={setShowTasks} label="Tasks" />
        </div>
      }
    >
      {error ? <LoadError error={error} onRetry={reload} what="the roadmap" /> : loading && !data ? <SkeletonRows rows={12} /> : !rows.length ? (
        <EmptyState icon={<MapIcon size={28} />} title="Nothing on the roadmap" description={active ? "No projects match these filters." : "Projects with start and end dates appear here."}
          action={active ? <Button size="sm" variant="secondary" onClick={() => setF(EMPTY)}>Clear filters</Button> : undefined} />
      ) : (
        <Gantt rows={rows} zoom={zoom} start={start} end={end} canEdit={canEdit} deps={data?.dependencies ?? []} scrollToToday={todayTick}
          onToggle={toggle} onCommit={commit} onOpenTask={(id) => shell.openTask(id)} />
      )}
      {allKeys.length === 0 && null}
      <ImpactDialog value={impact} onClose={() => setImpact(null)} onShifted={() => { reload(); invalidate("/tasks"); }} />
    </Page>
  );
}
