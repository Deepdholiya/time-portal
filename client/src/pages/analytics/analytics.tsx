import { lazy, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, FileSpreadsheet, Info, X } from "lucide-react";
import { Button, SegmentedControl, SkeletonRows, Tabs } from "@/components/arc";
import { Page } from "@/components/app/page";
import { ProjectDot } from "@/components/app/icons";
import { useApi, useLocal } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { download } from "@/lib/api";
import { addDays, fmtDate, hm, pct } from "@/lib/format";
import { emptyFilters, filterQuery, FilterBar, type Filters } from "./filter-bar";
import { BarList, ChartCard, Kpi, SERIES, TimeChart, UtilBar } from "./chart-kit";
import { EntriesSheet, LoadError } from "./entries";
import { Explore } from "./explore";
import { HealthTable } from "./health";
import type { AnalyticsData } from "./types";
import s from "./analytics.module.css";

// Loaded only for people who can view financials.
const Financials = lazy(() => import("./financials").then((m) => ({ default: m.Financials })));

type Drill = { title: string; query: Record<string, string> } | null;

export default function Analytics() {
  const { can, me } = useSession();
  const own = !can("analytics", "all");
  const showFin = can("financials", "view");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const setTab = (t: string) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });
  const [stored, setFilters] = useLocal<Filters>("analytics.filters", emptyFilters());
  const filters: Filters = { ...emptyFilters(), ...stored };
  const q = filterQuery(filters);
  const { data, error, loading, reload } = useApi<AnalyticsData>("/analytics", q);
  const [drill, setDrill] = useState<Drill>(null);

  const focusProject = (id: number) => { setFilters({ ...filters, projectId: [String(id)], subProjectId: [], taskId: [] }); setTab("overview"); };
  const focused = filters.projectId.length === 1 ? data?.byProject.find((p) => String(p.id) === filters.projectId[0]) : undefined;

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "explore", label: "Drill-down" },
    { value: "projects", label: "Project health" },
    { value: "financials", label: "Financials", hidden: !showFin },
  ];

  return (
    <Page
      title="Analytics" icon={<BarChart3 size={15} />}
      actions={<Button size="sm" variant="secondary" icon={<FileSpreadsheet size={14} />} onClick={() => download("/reports/export.xlsx", q)}>Export Excel</Button>}
      toolbar={<FilterBar value={filters} onChange={setFilters} hide={own ? ["team", "employee"] : []} presets={["Today", "This week", "Last week", "This month", "Last month", "Last 30 days", "This quarter", "Last quarter", "This year"]} />}
    >
      <div className={s.tabsRow}>
        <Tabs variant="underline" items={tabs} value={tab === "financials" && !showFin ? "overview" : tab} onChange={setTab} />
        <div className="grow" />
        {own && <span className={s.note}><Info size={13} />Showing your own time</span>}
        <span className="faint small">{fmtDate(filters.range.from, true)} – {fmtDate(filters.range.to, true)}</span>
      </div>
      <div className="page-pad">
        {tab === "financials" && showFin ? (
          <Suspense fallback={<SkeletonRows rows={8} />}><Financials query={q} /></Suspense>
        ) : tab === "explore" ? (
          <Explore base={q} ownOnly={own} />
        ) : error ? (
          <LoadError error={error} onRetry={reload} what="analytics" />
        ) : !data ? (
          <SkeletonRows rows={10} />
        ) : tab === "projects" ? (
          <HealthTable rows={data.health} onFocus={focusProject} />
        ) : (
          <Overview data={data} loading={loading} q={q} own={own} focused={focused} meName={me?.user.name}
            onProject={focusProject} onClearProject={() => setFilters({ ...filters, projectId: [], subProjectId: [], taskId: [] })} onDrill={setDrill} />
        )}
      </div>
      <EntriesSheet open={!!drill} onClose={() => setDrill(null)} title={drill?.title} query={drill?.query ?? null} showUser={!own} onChanged={reload} />
    </Page>
  );
}

function Overview({ data, q, own, focused, onProject, onClearProject, onDrill }: {
  data: AnalyticsData; loading: boolean; q: Record<string, string>; own: boolean; focused?: AnalyticsData["byProject"][number]; meName?: string;
  onProject: (id: number) => void; onClearProject: () => void; onDrill: (d: Drill) => void;
}) {
  const [grain, setGrain] = useLocal<"day" | "week">("analytics.grain", "day");
  const k = data.kpis;
  const series = useMemo(() => (grain === "day" ? data.byDay : data.byWeek).map((g) => ({ label: String(g.id), billable: g.billableMinutes, nonBillable: g.minutes - g.billableMinutes })), [data, grain]);
  const statusTotal = Object.values(k.tasks).reduce((a, b) => a + b, 0);
  const sub = (m: number) => (k.totalMinutes ? `${Math.round((m / k.totalMinutes) * 100)}% of total` : "");

  return (
    <>
      {focused && (
        <div className={s.focus}>
          <ProjectDot color={focused.color} />
          <span>Focused on <span className="medium">{focused.name}</span>{focused.sub && <span className="faint"> · {focused.sub}</span>}</span>
          <span className="faint">· click an employee or task below to see the exact entries</span>
          <div className="grow" />
          <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={onClearProject}>Clear focus</Button>
        </div>
      )}
      <div className={s.kpis}>
        <Kpi label="Total time" value={hm(k.totalMinutes)} sub={`${k.entries} entries`} />
        <Kpi label="Billable" value={hm(k.billableMinutes)} sub={sub(k.billableMinutes)} />
        <Kpi label="Non-billable" value={hm(k.nonBillableMinutes)} sub={sub(k.nonBillableMinutes)} />
        <Kpi label="Utilisation" value={k.utilization == null ? "—" : pct(k.utilization)} sub={`of ${hm(k.capacityMinutes)} capacity`} />
        {!own && <Kpi label="People" value={k.people} sub={`${k.projects} projects`} />}
        <Kpi label="Tasks" value={statusTotal} sub={`${k.tasksCompleted} completed in range`} />
        <Kpi label="Overdue / blocked" value={<span><span className={k.overdueTasks ? "danger" : ""}>{k.overdueTasks}</span><span className="faint"> / </span><span className={k.blockedTasks ? "warn" : ""}>{k.blockedTasks}</span></span>} sub="open tasks" />
      </div>

      <div className={s.charts}>
        <ChartCard title={`Hours by ${grain}`} className={s.span8}
          action={<SegmentedControl aria-label="Grain" value={grain} onChange={setGrain} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} />}>
          {series.length ? (
            <TimeChart data={series} fmtX={(v) => (grain === "day" ? fmtDate(v) : `Wk ${fmtDate(v)}`)} height={220}
              series={[{ key: "billable", label: "Billable", color: SERIES.billable }, { key: "nonBillable", label: "Non-billable", color: SERIES.nonBillable }]}
              onClick={(row) => { const d = String(row.label); onDrill({ title: grain === "day" ? `Entries on ${fmtDate(d, true)}` : `Week of ${fmtDate(d, true)}`, query: { ...q, from: d < q.from ? q.from : d, to: grain === "day" ? d : minDate(addDays(d, 6), q.to) } }); }} />
          ) : <div className={s.emptyChart}>No time in this range</div>}
        </ChartCard>
        <ChartCard title="Billable vs non-billable" className={s.span4}>
          <BarList items={[
            { key: "true", label: "Billable", color: SERIES.billable, minutes: k.billableMinutes, title: `${hm(k.billableMinutes)} · ${sub(k.billableMinutes)}` },
            { key: "false", label: "Non-billable", color: SERIES.nonBillable, minutes: k.nonBillableMinutes, title: `${hm(k.nonBillableMinutes)} · ${sub(k.nonBillableMinutes)}` },
          ]} max={Math.max(1, k.totalMinutes)} onClick={(key) => onDrill({ title: key === "true" ? "Billable entries" : "Non-billable entries", query: { ...q, billable: key } })} />
          <div className="faint small" style={{ margin: "6px 0 14px" }}>{k.totalMinutes ? `${pct(k.billableMinutes / k.totalMinutes)} of logged time is billable` : ""}</div>
          <div className="section-title">By client</div>
          <BarList items={data.byClient.map((c) => ({ key: String(c.id), label: c.name, minutes: c.minutes, billableMinutes: c.billableMinutes, color: "var(--accent)" }))}
            onClick={(id) => id !== "null" && onDrill({ title: data.byClient.find((c) => String(c.id) === id)?.name ?? "Client", query: { ...q, clientId: id } })} />
        </ChartCard>

        <ChartCard title="By project" className={s.span6} action={<span className="faint small">Click to focus</span>}>
          <BarList items={data.byProject.map((p) => ({ key: String(p.id), label: p.name, sub: p.sub, color: p.color, minutes: p.minutes, billableMinutes: p.billableMinutes }))}
            onClick={(id) => onProject(Number(id))} />
        </ChartCard>
        {own ? (
          <ChartCard title="By task" className={s.span6} action={<span className="faint small">Click for entries</span>}>
            <BarList items={data.byTask.slice(0, 10).map((t) => ({ key: String(t.id), label: t.name, sub: t.sub, color: t.color, minutes: t.minutes, billableMinutes: t.billableMinutes }))}
              onClick={(id) => onDrill({ title: data.byTask.find((t) => String(t.id) === id)?.name ?? "Task", query: id === "null" ? q : { ...q, taskId: id } })} />
          </ChartCard>
        ) : (
          <ChartCard title={focused ? `Employees on ${focused.name}` : "By employee"} className={s.span6} action={<span className="faint small">Click for entries</span>}>
            <BarList items={data.byEmployee.map((e) => ({ key: String(e.id), label: e.name, sub: e.sub, minutes: e.minutes, billableMinutes: e.billableMinutes, color: "var(--accent)" }))}
              onClick={(id) => onDrill({ title: `${data.byEmployee.find((e) => String(e.id) === id)?.name}${focused ? ` · ${focused.name}` : ""}`, query: { ...q, userId: id } })} />
          </ChartCard>
        )}

        {!own && (
          <ChartCard title="Utilisation" className={s.span6} action={<span className="faint small">Logged vs capacity, marker at 100%</span>}>
            {data.byEmployee.length ? (
              <div className={s.barList}>
                {data.byEmployee.map((e) => (
                  <div key={e.key} className={s.barRow} style={{ gridTemplateColumns: "minmax(110px, 38%) 1fr 90px" }}>
                    <div className={s.barLabel}><span className="ellipsis">{e.name}</span><span className="faint small">{e.leaveDays ? `${e.leaveDays}d leave · ` : ""}{e.daysWorked}/{e.workingDays} days</span></div>
                    <UtilBar value={e.utilization} width={260} />
                    <span className="num small muted right">{hm(e.minutes)} / {hm(e.capacityMinutes)}</span>
                  </div>
                ))}
              </div>
            ) : <div className={s.emptyChart}>No people in range</div>}
          </ChartCard>
        )}
        {!own && (
          <ChartCard title="By task" className={s.span6} action={<span className="faint small">Top 25 · click for entries</span>}>
            <BarList items={data.byTask.slice(0, 12).map((t) => ({ key: String(t.id), label: t.name, sub: t.sub, color: t.color, minutes: t.minutes, billableMinutes: t.billableMinutes }))}
              onClick={(id) => onDrill({ title: data.byTask.find((t) => String(t.id) === id)?.name ?? "Task", query: id === "null" ? q : { ...q, taskId: id } })} />
          </ChartCard>
        )}
        <ChartCard title="By sub-project" className={s.span6}>
          <BarList items={data.bySubProject.slice(0, 12).map((c) => ({ key: String(c.id), label: c.name, sub: c.sub, minutes: c.minutes, billableMinutes: c.billableMinutes, color: c.color }))}
            onClick={(id) => id !== "null" && onDrill({ title: data.bySubProject.find((c) => String(c.id) === id)?.name ?? "Sub-project", query: { ...q, subProjectId: id } })} />
        </ChartCard>
        {!own && data.byTeam.length > 0 && (
          <ChartCard title="By team" className={s.span6}>
            <BarList items={data.byTeam.map((c) => ({ key: String(c.id), label: c.name, minutes: c.minutes, billableMinutes: c.billableMinutes, color: "var(--accent)" }))}
              onClick={(id) => id !== "null" && onDrill({ title: data.byTeam.find((c) => String(c.id) === id)?.name ?? "Team", query: { ...q, teamId: id } })} />
          </ChartCard>
        )}
      </div>
    </>
  );
}

const minDate = (a: string, b: string) => (a < b ? a : b);
