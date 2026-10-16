import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, FileText, Mail, Printer, Save, Table2 } from "lucide-react";
import { Button, DateRangePicker, IconButton, Menu, SegmentedControl, SkeletonRows, Tooltip, toast } from "@/components/arc";
import { Page } from "@/components/app/page";
import { download, post } from "@/lib/api";
import { useLocal } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { today } from "@/lib/format";
import { emptyFilters, filterQuery, FilterBar, type Filters } from "../analytics/filter-bar";
import { LoadError } from "../analytics/entries";
import { ConfigBar, DEFAULT_CONFIG, type ReportConfig } from "./report-config";
import { ResultView, type ReportResult } from "./report-result";
import { SaveDialog, SavedMenu, useSavedReports, type SavedReport } from "./saved-reports";
import { periodLabel, periodRange, PRESET_LABEL, shiftAnchor, type Preset } from "./period";
import ClientEmailDialog from "./client-email-dialog";
import s from "./reports.module.css";

const PRESETS: Preset[] = ["daily", "weekly", "monthly", "quarterly", "yearly", "custom"];
const LIST_KEYS = ["clientId", "projectId", "subProjectId", "teamId", "userId", "taskId", "status"] as const;

// Saved presets may be our period names or a date-range preset like "Last week".
function presetFromSaved(p?: string): { preset: Preset; anchor: string } {
  const t = today();
  const lower = (p ?? "").toLowerCase();
  if ((PRESETS as string[]).includes(lower)) return { preset: lower as Preset, anchor: t };
  if (lower === "last week") return { preset: "weekly", anchor: shiftAnchor("weekly", t, -1) };
  if (lower === "this week") return { preset: "weekly", anchor: t };
  if (lower === "last month") return { preset: "monthly", anchor: shiftAnchor("monthly", t, -1) };
  if (lower === "this month") return { preset: "monthly", anchor: t };
  return { preset: "monthly", anchor: t };
}

export default function Reports() {
  const { me, can } = useMe();
  const [params, setParams] = useSearchParams();
  const [preset, setPreset] = useLocal<Preset>("reports.preset", "monthly");
  const [anchor, setAnchor] = useState(today());
  const [custom, setCustom] = useLocal("reports.custom", { from: today().slice(0, 8) + "01", to: today() });
  const [stored, setStored] = useLocal<Filters>("reports.filters", emptyFilters());
  const [config, setConfig] = useLocal<ReportConfig>("reports.config", DEFAULT_CONFIG);
  const range = preset === "custom" ? custom : periodRange(preset, anchor, me.company.weekStartsOn);
  const filters: Filters = { ...emptyFilters(), ...stored, range: { ...range, preset: "Custom" } };
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
    setStored(next);
    setConfig({ ...DEFAULT_CONFIG, ...(r.config.config ?? {}) } as ReportConfig);
    const p = presetFromSaved(r.config.preset);
    setPreset(p.preset);
    setAnchor(p.anchor);
    if (p.preset === "custom" && f.from && f.to) setCustom({ from: f.from, to: f.to });
    setCurrent(r);
  }, [setStored, setConfig, setPreset, setCustom]);
  // /reports?saved=<id> (from scheduled-report notifications)
  const savedParam = params.get("saved");
  useEffect(() => {
    if (!savedParam || !saved.data) return;
    const r = saved.data.find((x) => String(x.id) === savedParam);
    if (r) loadSaved(r);
    setParams((p) => { p.delete("saved"); return p; }, { replace: true });
  }, [savedParam, saved.data, loadSaved, setParams]);

  const exportQ = { ...fq, config: JSON.stringify(config) };
  const singleProject = filters.projectId.length === 1 ? Number(filters.projectId[0]) : null;
  const [emailOpen, setEmailOpen] = useState(false);
  const canExport = can("export", "own");

  return (
    <Page
      title="Reports" icon={<Table2 size={15} />}
      actions={
        <div className="row gap-4">
          {singleProject && can("clientEmail", "yes") && <Button size="sm" variant="ghost" icon={<Mail size={14} />} onClick={() => setEmailOpen(true)}>Draft client update</Button>}
          <SavedMenu list={saved.data ?? []} current={current} onLoad={loadSaved} onChanged={() => { saved.reload(); setCurrent(null); }} />
          <Button size="sm" variant="ghost" icon={<Save size={14} />} onClick={() => setSaving(true)}>Save</Button>
          {canExport && (
            <>
              <Button size="sm" variant="secondary" icon={<FileSpreadsheet size={14} />} onClick={() => download("/reports/export.xlsx", exportQ)}>Excel</Button>
              <Menu placement="bottom-end" trigger={<IconButton size="sm" variant="secondary" label="More exports" icon={<FileDown size={14} />} />}
                items={[
                  { label: "Export CSV", icon: <FileText size={14} />, onSelect: () => download("/reports/export.csv", exportQ) },
                  { label: "Export PDF", icon: <FileText size={14} />, onSelect: () => download("/reports/export.pdf", exportQ) },
                  { type: "separator" },
                  { label: "Print", icon: <Printer size={14} />, onSelect: () => window.print() },
                ]} />
            </>
          )}
        </div>
      }
      toolbar={
        <div className="col" style={{ width: "100%", gap: 8 }}>
          <div className="row wrap">
            <SegmentedControl aria-label="Period" value={preset} onChange={(p) => { setPreset(p); setAnchor(today()); }} options={PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] }))} />
            {preset === "custom" ? (
              <DateRangePicker size="sm" value={{ ...custom, preset: "Custom" }} onChange={(r) => setCustom({ from: r.from, to: r.to })} />
            ) : (
              <div className="row gap-4">
                <IconButton size="sm" label="Previous period" icon={<ChevronLeft size={15} />} onClick={() => setAnchor(shiftAnchor(preset, anchor, -1))} />
                <span className={s.period}>{periodLabel(preset, range)}</span>
                <IconButton size="sm" label="Next period" icon={<ChevronRight size={15} />} onClick={() => setAnchor(shiftAnchor(preset, anchor, 1))} />
                {anchor !== today() && <Tooltip content="Back to the current period"><Button size="sm" variant="ghost" onClick={() => setAnchor(today())}>Today</Button></Tooltip>}
              </div>
            )}
          </div>
          <FilterBar value={filters} onChange={(f) => setStored(f)} showRange={false} hide={can("analytics", "all") ? [] : ["team", "employee"]} />
        </div>
      }
    >
      <div className={s.configWrap}><ConfigBar value={config} onChange={setConfig} /></div>
      <div className="page-pad">
        {error ? <LoadError error={error} onRetry={run} what="reports" /> : !data ? <SkeletonRows rows={10} /> : (
          <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
            <ResultView data={data} config={config} onMore={loadMore} loadingMore={more} />
          </div>
        )}
      </div>
      <SaveDialog open={saving} onClose={() => setSaving(false)} current={current}
        payload={{ filters: fq, config, preset }} onSaved={(id) => { setPendingId(id); saved.reload(); }} />
      <ClientEmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} projectId={singleProject} />
    </Page>
  );
}
