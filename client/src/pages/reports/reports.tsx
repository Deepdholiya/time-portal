import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Briefcase, ChevronDown, Download, Mail, Save, Table2 } from "lucide-react";
import { Button, Combobox, PRESETS, presetRange, SkeletonRows, Tabs, toast, type DateRange } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { AiInsight, type AiSource } from "@/components/app/ai-button";
import { Page } from "@/components/app/page";
import { post } from "@/lib/api";
import { useLocal } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { emptyFilters, filterQuery, FilterBar, useOptions, type Filters } from "../analytics/filter-bar";
import { ExportDialog } from "@/components/app/export-dialog";
import { LoadError } from "../analytics/entries";
import { DEFAULT_CONFIG, GroupByMenu, type ReportConfig } from "./report-config";
import { ResultView, type ReportResult } from "./report-result";
import { SaveDialog, SavedMenu, useSavedReports, type SavedReport } from "./saved-reports";
import ClientEmailDialog from "./client-email-dialog";

const LIST_KEYS = ["clientId", "projectId", "subProjectId", "teamId", "userId", "taskId", "status"] as const;

// Saved reports store either a date-range preset ("Last week") or an older period name ("weekly").
const OLD_PERIODS: Record<string, string> = { daily: "Today", weekly: "This week", monthly: "This month", quarterly: "This quarter", yearly: "This year" };
function rangeFromSaved(p: string | undefined, from?: string, to?: string): DateRange {
  const name = OLD_PERIODS[(p ?? "").toLowerCase()] ?? p ?? "";
  if (PRESETS.includes(name)) return presetRange(name);
  if (from && to) return { from, to, preset: "Custom" };
  return presetRange("This month");
}

export default function Reports() {
  const { can } = useMe();
  const [params, setParams] = useSearchParams();
  const [stored, setStored] = useLocal<Filters>("reports.filters", emptyFilters());
  const [config, setConfig] = useLocal<ReportConfig>("reports.config", DEFAULT_CONFIG);
  const [view, setView] = useLocal<"summary" | "detailed">("reports.view", "summary");
  // A named range ("This month") is recomputed each visit so it never goes stale; a custom range is kept as picked.
  const savedRange = stored.range ?? presetRange("This month");
  const range = savedRange.preset && savedRange.preset !== "Custom" ? presetRange(savedRange.preset) : savedRange;
  const filters: Filters = { ...emptyFilters(), ...stored, range };
  const fq = filterQuery(filters);

  const [data, setData] = useState<ReportResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const seq = useRef(0);
  const reqKey = JSON.stringify([fq, config]);

  const run = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await post<ReportResult>("/reports/run", { filters: fq, config, offset: 0, limit: 200 });
      if (n === seq.current) { setData(r); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e as Error);
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);
  useEffect(() => { run(); }, [run]);

  const loadMore = async () => {
    if (!data) return;
    setMore(true);
    try {
      const r = await post<ReportResult>("/reports/run", { filters: fq, config, offset: data.rows.length, limit: 200 });
      setData({ ...data, rows: [...data.rows, ...r.rows] });
    } catch (e) { toast.error(e); } finally { setMore(false); }
  };

  // Saved reports
  const saved = useSavedReports();
  const [current, setCurrent] = useState<SavedReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  useEffect(() => {
    const r = pendingId && saved.data?.find((x) => x.id === pendingId);
    if (r) { setCurrent(r); setPendingId(null); }
  }, [pendingId, saved.data]);
  const loadSaved = useCallback((r: SavedReport) => {
    const f = r.config.filters ?? {};
    const next = emptyFilters();
    for (const k of LIST_KEYS) if (f[k]) (next[k] as string[]) = String(f[k]).split(",").filter(Boolean);
    next.billable = f.billable ?? "";
    next.tag = f.tag ?? "";
    setConfig({ ...DEFAULT_CONFIG, ...(r.config.config ?? {}) } as ReportConfig);
    next.range = rangeFromSaved(r.config.preset, f.from, f.to);
    setStored(next);
    setCurrent(r);
  }, [setStored, setConfig]);
  // /reports?saved=<id> (from scheduled-report notifications)
  const savedParam = params.get("saved");
  useEffect(() => {
    if (!savedParam || !saved.data) return;
    const r = saved.data.find((x) => String(x.id) === savedParam);
    if (r) loadSaved(r);
    setParams((p) => { p.delete("saved"); return p; }, { replace: true });
  }, [savedParam, saved.data, loadSaved, setParams]);

  const singleProject = filters.projectId.length === 1 ? Number(filters.projectId[0]) : null;
  const [emailOpen, setEmailOpen] = useState(false);
  const canExport = can("export", "own");
  const [exporting, setExporting] = useState(false);

  const summarize = () => post<{ summary: string; source: AiSource }>("/ai/report-summary", {
    from: filters.range.from, to: filters.range.to, groupBy: config.groupBy[0],
    totals: data!.totals, groups: (data!.groups.length ? data!.groups : data!.chart).slice(0, 30).map((g) => ({ name: g.name, minutes: g.minutes, billableMinutes: g.billableMinutes })),
  });

  const { data: opts } = useOptions();
  const projectOpts = (opts?.projects ?? []).filter((p) => !p.parentId).map((p) => ({ value: String(p.id), label: p.name, icon: <ProjectDot color={p.color} /> }));
  const projLabel = filters.projectId.length === 0 ? "All" : filters.projectId.length === 1 ? projectOpts.find((o) => o.value === filters.projectId[0])?.label ?? "1 project" : `${filters.projectId.length} projects`;

  return (
    <Page
      title="Reports" icon={<Table2 size={15} />}
      tabs={<Tabs value={view} onChange={(v) => setView(v as "summary" | "detailed")} items={[{ value: "summary", label: "Summary" }, { value: "detailed", label: "Detailed" }]} />}
      actions={
        <div className="row gap-4">
          {data && <AiInsight label="Summarize this report with AI" title="Report summary" load={summarize} />}
          {singleProject && can("clientEmail", "yes") && <Button size="sm" variant="secondary" icon={<Mail size={14} />} onClick={() => setEmailOpen(true)}>Client update</Button>}
          <SavedMenu list={saved.data ?? []} current={current} onLoad={loadSaved} onChanged={() => { saved.reload(); setCurrent(null); }} />
          <Button size="sm" variant="secondary" icon={<Save size={14} />} onClick={() => setSaving(true)}>Save</Button>
        </div>
      }
      toolbar={
        <FilterBar value={filters} onChange={(f) => setStored(f)} hide={can("analytics", "all") ? ["project"] : ["project", "team", "employee"]}
          presets={PRESETS}
          afterRange={<>
            <GroupByMenu value={config} onChange={setConfig} />
            <Combobox multiple options={projectOpts} value={filters.projectId} width={280} searchPlaceholder="Search projects…"
              onChange={(v) => setStored({ ...filters, projectId: v, subProjectId: [], taskId: [] })}
              trigger={<Button size="sm" variant="secondary" icon={<Briefcase size={14} />} iconRight={<ChevronDown size={13} className="faint" />} aria-label="Project filter"><span className="faint">Project</span>&nbsp;{projLabel}</Button>} />
          </>}
          trailing={canExport && <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => setExporting(true)}>Export</Button>} />
      }
    >
      <div className="page-pad">
        {error ? <LoadError error={error} onRetry={run} what="reports" /> : !data ? <SkeletonRows rows={10} /> : (
          <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
            <ResultView data={data} config={config} onConfig={setConfig} view={view} onMore={loadMore} loadingMore={more} />
          </div>
        )}
      </div>
      <SaveDialog open={saving} onClose={() => setSaving(false)} current={current}
        payload={{ filters: fq, config, preset: filters.range.preset ?? "Custom" }} onSaved={(id) => { setPendingId(id); saved.reload(); }} />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} query={fq} initial={config.groupBy.filter((g) => ["employee", "project", "subProject", "client", "task", "team"].includes(g))} />
      <ClientEmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} projectId={singleProject} />
    </Page>
  );
}
