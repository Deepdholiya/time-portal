import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { fmtDate, hm, hours } from "@/lib/format";
import { ChartCard, Kpi, TimeChart, SERIES } from "../analytics/chart-kit";
import type { EntryRow } from "../analytics/entries";
import type { Group } from "../analytics/types";
import { COLUMN_OPTIONS, GROUP_OPTIONS, type ReportConfig } from "./report-config";
import a from "../analytics/analytics.module.css";
import s from "./reports.module.css";

export interface ReportGroup extends Group { children?: Group[] }
export interface ReportResult {
  level: "own" | "all";
  totals: { minutes: number; billableMinutes: number; nonBillableMinutes: number; entries: number };
  groups: ReportGroup[];
  chart: Group[];
  rows: EntryRow[];
  rowCount: number;
}

const groupLabel = (k?: string) => GROUP_OPTIONS.find((o) => o.value === k)?.label ?? "";
const timeDim = (k: string) => k === "day" || k === "week" || k === "month";
const fmtGroupName = (by: string, g: Group) => (by === "day" ? fmtDate(g.name, true) : by === "week" ? `Week of ${fmtDate(g.name, true)}` : by === "month" ? g.name : g.name);

function cell(r: EntryRow, k: string) {
  switch (k) {
    case "date": return <td key={k} className="num">{fmtDate(r.date)}</td>;
    case "week": return <td key={k} className="num muted">{fmtDate(r.week)}</td>;
    case "employee": return <td key={k}>{r.user.name}</td>;
    case "team": return <td key={k} className="muted">{r.team ?? "—"}</td>;
    case "client": return <td key={k} className="muted">{r.client ?? "—"}</td>;
    case "project": return <td key={k}><span className="row gap-4"><ProjectDot color={r.projectColor} />{r.project}</span></td>;
    case "subProject": return <td key={k} className="muted">{r.subProject ?? "—"}</td>;
    case "task": return <td key={k} className="wrap-cell" style={{ minWidth: 140 }}>{r.task ?? <span className="faint">—</span>}</td>;
    case "milestone": return <td key={k} className="muted">{r.milestone ?? "—"}</td>;
    case "description": return <td key={k} className="wrap-cell" style={{ minWidth: 240 }}>{r.description || <span className="faint">No description</span>}</td>;
    case "hours": return <td key={k} className="num medium">{hours(r.minutes, 2)}</td>;
    case "billable": return <td key={k}>{r.billable ? <Badge size="sm" tone="green">Yes</Badge> : <Badge size="sm">No</Badge>}</td>;
    case "start": return <td key={k} className="num muted">{r.startTime ?? "—"}</td>;
    case "end": return <td key={k} className="num muted">{r.endTime ?? "—"}</td>;
    default: return <td key={k} />;
  }
}

export function ResultView({ data, config, onMore, loadingMore }: { data: ReportResult; config: ReportConfig; onMore: () => void; loadingMore: boolean }) {
  const t = data.totals;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [g1, g2] = config.groupBy;
  if (!t.entries) return <EmptyState title="No time in this report" description="Change the period or filters to see entries." />;

  const chartData = data.chart.map((g) => ({ label: timeDim(config.chartBy) ? String(g.id) : g.name, billable: g.billableMinutes, nonBillable: g.minutes - g.billableMinutes }));
  const fmtX = (v: string) => (config.chartBy === "day" || config.chartBy === "week" ? fmtDate(v) : v.length > 18 ? v.slice(0, 17) + "…" : v);
  const cols = COLUMN_OPTIONS.filter((c) => config.columns.includes(c.value));

  return (
    <div className="col gap-16">
      <div className={a.kpis} style={{ marginBottom: 0 }}>
        <Kpi label="Total" value={hm(t.minutes)} sub={`${hours(t.minutes, 2)} h`} />
        <Kpi label="Billable" value={hm(t.billableMinutes)} sub={t.minutes ? `${Math.round((t.billableMinutes / t.minutes) * 100)}%` : ""} />
        <Kpi label="Non-billable" value={hm(t.nonBillableMinutes)} />
        <Kpi label="Entries" value={t.entries} sub={data.level === "own" ? "Your own time" : "All permitted time"} />
      </div>

      {config.chart !== "none" && chartData.length > 0 && (
        <ChartCard title={`Hours by ${groupLabel(config.chartBy).toLowerCase()}`}>
          <TimeChart data={chartData} kind={config.chart} fmtX={fmtX} height={220}
            series={config.chart === "line" ? [{ key: "billable", label: "Billable", color: SERIES.billable }, { key: "nonBillable", label: "Non-billable", color: "var(--text-3)" }]
              : [{ key: "billable", label: "Billable", color: SERIES.billable }, { key: "nonBillable", label: "Non-billable", color: SERIES.nonBillable }]} />
        </ChartCard>
      )}

      {g1 && data.groups.length > 0 && (
        <section className={a.panel}>
          <div className={a.panelHead}><span className="medium">Summary by {groupLabel(g1).toLowerCase()}{g2 ? ` and ${groupLabel(g2).toLowerCase()}` : ""}</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{groupLabel(g1)}{g2 ? ` / ${groupLabel(g2)}` : ""}</th><th className="num">Hours</th><th className="num">Billable</th><th className="num">Non-billable</th><th className="num">Entries</th><th className="num">Share</th></tr></thead>
              <tbody>
                {data.groups.map((g) => {
                  const open = !collapsed.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr className={g.children ? `clickable ${s.subtotal}` : ""} onClick={g.children ? () => toggle(g.key) : undefined}>
                        <td>
                          <span className="row">
                            {g.children && (open ? <ChevronDown size={14} className="faint" /> : <ChevronRight size={14} className="faint" />)}
                            {g.color && <ProjectDot color={g.color} />}
                            <span className="medium">{fmtGroupName(g1, g)}</span>
                            {g.sub && <span className="faint small">{g.sub}</span>}
                          </span>
                        </td>
                        <td className="num medium">{hours(g.minutes, 2)}</td>
                        <td className="num">{hours(g.billableMinutes, 2)}</td>
                        <td className="num muted">{hours(g.minutes - g.billableMinutes, 2)}</td>
                        <td className="num muted">{g.entries}</td>
                        <td className="num muted">{Math.round((g.minutes / t.minutes) * 100)}%</td>
                      </tr>
                      {open && g.children?.map((c) => (
                        <tr key={g.key + c.key}>
                          <td style={{ paddingLeft: 42 }}><span className="row">{c.color && <ProjectDot color={c.color} />}<span>{fmtGroupName(g2!, c)}</span>{c.sub && g2 !== "subProject" && <span className="faint small">{c.sub}</span>}</span></td>
                          <td className="num">{hours(c.minutes, 2)}</td>
                          <td className="num muted">{hours(c.billableMinutes, 2)}</td>
                          <td className="num muted">{hours(c.minutes - c.billableMinutes, 2)}</td>
                          <td className="num faint">{c.entries}</td>
                          <td />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot><tr><td>Grand total</td><td className="num">{hours(t.minutes, 2)}</td><td className="num">{hours(t.billableMinutes, 2)}</td><td className="num">{hours(t.nonBillableMinutes, 2)}</td><td className="num">{t.entries}</td><td className="num">100%</td></tr></tfoot>
            </table>
          </div>
        </section>
      )}

      <section className={a.panel}>
        <div className={a.panelHead}><span className="medium">Time entries</span><span className="faint small">{data.rows.length} of {data.rowCount}</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{cols.map((c) => <th key={c.value} className={c.value === "hours" ? "num" : ""}>{c.label}</th>)}</tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.id}>{cols.map((c) => cell(r, c.value))}</tr>)}</tbody>
            <tfoot><tr>{cols.map((c, i) => <td key={c.value} className={c.value === "hours" ? "num" : ""}>{c.value === "hours" ? hours(t.minutes, 2) : i === 0 ? "Total" : ""}</td>)}</tr></tfoot>
          </table>
        </div>
        {data.rows.length < data.rowCount && (
          <div className={a.pager}><Button size="sm" variant="secondary" loading={loadingMore} onClick={onMore}>Load {Math.min(200, data.rowCount - data.rows.length)} more</Button></div>
        )}
      </section>
    </div>
  );
}
