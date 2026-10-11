import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Download, Info, Users } from "lucide-react";
import { Avatar, Button, Combobox, SkeletonRows, Tabs } from "@/components/ui";
import { Page } from "@/components/app/page";
import { useApi, useLocal } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { ExportDialog } from "@/components/app/export-dialog";
import { fmtDate } from "@/lib/format";
import { emptyFilters, filterQuery, FilterBar, useOptions, type Filters } from "./filter-bar";
import { Overview } from "./overview";
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
  const { data, error, reload } = useApi<AnalyticsData>("/analytics", q);
  const [drill, setDrill] = useState<Drill>(null);
  const [exporting, setExporting] = useState(false);

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
      actions={can("export", "own") && <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => setExporting(true)}>Export</Button>}
      toolbar={<FilterBar value={filters} onChange={setFilters} hide={own ? ["team", "employee"] : []} leading={!own && <ScopePicker value={filters.userId} meId={me?.user.id} onChange={(userId) => setFilters({ ...filters, userId })} />} presets={["Today", "This week", "Last week", "This month", "Last month", "Last 30 days", "This quarter", "Last quarter", "This year"]} />}
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
          <Overview data={data} q={q} own={own} single={filters.userId.length === 1} weekStartsOn={me?.company.weekStartsOn || 1} focused={focused}
            onProject={focusProject} onClearProject={() => setFilters({ ...filters, projectId: [], subProjectId: [], taskId: [] })} onDrill={setDrill} />
        )}
      </div>
      <EntriesSheet open={!!drill} onClose={() => setDrill(null)} title={drill?.title} query={drill?.query ?? null} showUser={!own} onChanged={reload} />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} query={q} />
    </Page>
  );
}

/** Whose time the dashboard shows: everyone, only me, or one employee (several can still be picked in Filter). */
function ScopePicker({ value, meId, onChange }: { value: string[]; meId?: number; onChange: (v: string[]) => void }) {
  const { data: opts } = useOptions();
  const cur = value.length === 0 ? "all" : value.length === 1 ? (value[0] === String(meId) ? "me" : value[0]) : "many";
  const options = [
    { value: "all", label: "All employees", icon: <Users size={14} /> },
    { value: "me", label: "Only me", icon: <Avatar name={opts?.users.find((u) => u.id === meId)?.name ?? "Me"} size={16} /> },
    ...(cur === "many" ? [{ value: "many", label: `${value.length} employees` }] : []),
    ...(opts?.users ?? []).filter((u) => u.id !== meId).map((u) => ({ value: String(u.id), label: u.name, icon: <Avatar name={u.name} size={16} />, keywords: u.email })),
  ];
  return (
    <Combobox size="sm" width={240} options={options} value={cur} aria-label="Employee" searchPlaceholder="Search employees…"
        onChange={(v) => { if (!v || v === "many") return; onChange(v === "all" ? [] : v === "me" ? [String(meId)] : [v]); }} />
  );
}
