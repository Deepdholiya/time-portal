import { useState } from "react";
import { Download, Rows3, Users } from "lucide-react";
import { Button, EmptyState, SkeletonRows, Tooltip } from "@/components/ui";
import { Page } from "@/components/app/page";
import { ProjectDot } from "@/components/app/icons";
import { ExportDialog } from "@/components/app/export-dialog";
import { TimeRangeControl, useRangeParam } from "@/components/app/time-range";
import { useApi, useLocal } from "@/lib/hooks";
import { dayName, fmtDate, hm, range, today } from "@/lib/format";
import { emptyFilters, filterQuery, FilterBar, type Filters } from "../analytics/filter-bar";
import { EntriesSheet, LoadError } from "../analytics/entries";
import s from "./team-time.module.css";

type GroupBy = "employee" | "project" | "subProject" | "client" | "task";
interface Row { key: string; label: string; color?: string; sub?: string; days: Record<string, number>; minutes: number; billableMinutes: number; entries: number; userId?: number }
interface Resp { rows: Row[]; days: { userId: number; date: string; status: string }[]; total: number }

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "employee", label: "Employee" }, { value: "project", label: "Project" }, { value: "subProject", label: "Sub-project" }, { value: "client", label: "Client" }, { value: "task", label: "Task" },
];

// Row key prefix → filter that isolates the row's entries.
function rowFilter(groupBy: GroupBy, key: string): Record<string, string> {
  const id = key.slice(1);
  if (id === "0") return {};
  return { employee: { userId: id }, project: { projectId: id }, subProject: { subProjectId: id }, client: { clientId: id }, task: { taskId: id } }[groupBy];
}

export default function TeamTime() {
  const [groupBy, setGroupBy] = useLocal<GroupBy>("teamtime.groupBy", "employee");
  const [rangeSel, setRange] = useRangeParam("This week");
  const { from, to } = rangeSel;
  const [stored, setStored] = useLocal<Filters>("teamtime.filters", emptyFilters());
  const [exporting, setExporting] = useState(false);
  const filters: Filters = { ...emptyFilters(), ...stored, range: { from, to, preset: "Custom" } };
  const q = filterQuery(filters);
  const { data, error, loading, reload } = useApi<Resp>("/timesheets/combined", { ...q, groupBy });
  const [drill, setDrill] = useState<{ title: string; query: Record<string, string> } | null>(null);

  const days = range(from, to);
  const dayTotals = days.map((d) => (data?.rows ?? []).reduce((a, r) => a + (r.days[d] ?? 0), 0));
  const billable = (data?.rows ?? []).reduce((a, r) => a + r.billableMinutes, 0);
  const label = from === to ? fmtDate(from, true) : `${fmtDate(from)} – ${fmtDate(to, true)}`;
  const compact = days.length > 14;

  return (
    <Page
      title="Team timesheets" icon={<Users size={15} />}
      actions={<Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => setExporting(true)}>Export</Button>}
      toolbar={
        <div style={{ width: "100%" }}>
          <FilterBar value={filters} onChange={setStored} showRange={false} hide={["status"]}
            leading={<TimeRangeControl value={rangeSel} onChange={setRange} />}
            extra={{ sections: [{ key: "rows", label: "Rows", icon: <Rows3 size={13} />, single: true, required: true, defaultValue: "employee", options: GROUPS }], value: { rows: [groupBy] }, onChange: (v) => setGroupBy((v.rows?.[0] as GroupBy) ?? "employee") }} />
        </div>
      }
    >
      {error ? <LoadError error={error} onRetry={reload} what="team timesheets" /> : loading && !data ? <SkeletonRows rows={10} /> : !data?.rows.length ? (
        <EmptyState title="No time logged" description="Nobody logged time in this period with these filters." />
      ) : (
        <div className="table-wrap" style={{ height: "100%" }}>
          <table className={`table ${s.grid}`}>
            <thead>
              <tr>
                <th className={s.sticky}>{GROUPS.find((g) => g.value === groupBy)?.label}</th>
                {days.map((d) => <th key={d} className={`num ${d === today() ? s.today : ""} ${isWeekend(d) ? s.weekend : ""}`}>{compact ? d.slice(8) : <>{dayName(d)} <span className="faint">{d.slice(8)}</span></>}</th>)}
                <th className="num">Total</th>
                <th className="num">Billable</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                return (
                  <tr key={r.key} className="clickable" onClick={() => setDrill({ title: `${r.label} · ${label}`, query: { ...q, ...rowFilter(groupBy, r.key) } })}>
                    <td className={s.sticky}>
                      <div className="row" style={{ maxWidth: 280 }}>
                        {r.color && <ProjectDot color={r.color} />}
                        <span className="medium ellipsis">{r.label}</span>
                        {r.sub && <span className="faint small ellipsis">{r.sub}</span>}
                      </div>
                    </td>
                    {days.map((d) => {
                      const m = r.days[d] ?? 0;
                      return (
                        <td key={d} className={`num ${isWeekend(d) ? s.weekend : ""} ${m ? "" : "faint"}`}
                          onClick={m ? (e) => { e.stopPropagation(); setDrill({ title: `${r.label} · ${fmtDate(d, true)}`, query: { ...q, ...rowFilter(groupBy, r.key), from: d, to: d } }); } : undefined}>
                          {m ? <span className={s.cell}>{hm(m, true)}</span> : "–"}
                        </td>
                      );
                    })}
                    <td className="num medium">{hm(r.minutes, true)}</td>
                    <td className="num muted">{hm(r.billableMinutes, true)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={s.sticky}>Total <span className="faint small">{data.rows.length} rows</span></td>
                {dayTotals.map((m, i) => <td key={days[i]} className="num">{m ? hm(m, true) : "–"}</td>)}
                <td className="num">{hm(data.total, true)}</td>
                <td className="num"><Tooltip content={`${data.total ? Math.round((billable / data.total) * 100) : 0}% billable`}><span>{hm(billable, true)}</span></Tooltip></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <ExportDialog open={exporting} onClose={() => setExporting(false)} query={q} initial={[groupBy]} />
      <EntriesSheet open={!!drill} onClose={() => setDrill(null)} title={drill?.title} query={drill?.query ?? null} onChanged={reload} />
    </Page>
  );
}

const isWeekend = (d: string) => { const n = new Date(d + "T00:00:00").getDay(); return n === 0 || n === 6; };
