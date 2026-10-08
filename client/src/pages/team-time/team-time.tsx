import { useState } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Users } from "lucide-react";
import { Badge, Button, EmptyState, IconButton, SegmentedControl, SkeletonRows, Tooltip } from "@/components/arc";
import { Page } from "@/components/app/page";
import { ProjectDot } from "@/components/app/icons";
import { download } from "@/lib/api";
import { useApi, useLocal } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { addDays, dayName, fmtDate, hm, range, today, weekStart, monthStart, monthEnd } from "@/lib/format";
import { emptyFilters, filterQuery, FilterBar, type Filters } from "../analytics/filter-bar";
import { EntriesSheet, LoadError } from "../analytics/entries";
import s from "./team-time.module.css";

type GroupBy = "employee" | "project" | "subProject" | "client" | "task";
type Span = "week" | "2weeks" | "month";
interface Row { key: string; label: string; color?: string; sub?: string; days: Record<string, number>; minutes: number; billableMinutes: number; entries: number; userId?: number }
interface Resp { rows: Row[]; periods: { userId: number; weekStart: string; status: string }[]; total: number }

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "employee", label: "Employee" }, { value: "project", label: "Project" }, { value: "subProject", label: "Sub-project" }, { value: "client", label: "Client" }, { value: "task", label: "Task" },
];
const STATUS_TONE: Record<string, "yellow" | "green" | "red" | "gray"> = { SUBMITTED: "yellow", APPROVED: "green", REJECTED: "red" };
const STATUS_LABEL: Record<string, string> = { SUBMITTED: "Submitted", APPROVED: "Approved", REJECTED: "Sent back" };

// Row key prefix → filter that isolates the row's entries.
function rowFilter(groupBy: GroupBy, key: string): Record<string, string> {
  const id = key.slice(1);
  if (id === "0") return {};
  return { employee: { userId: id }, project: { projectId: id }, subProject: { subProjectId: id }, client: { clientId: id }, task: { taskId: id } }[groupBy];
}

export default function TeamTime() {
  const { me } = useMe();
  const ws = me.company.weekStartsOn ?? 1;
  const [groupBy, setGroupBy] = useLocal<GroupBy>("teamtime.groupBy", "employee");
  const [span, setSpan] = useLocal<Span>("teamtime.span", "week");
  const [anchor, setAnchor] = useState(today());
  const [stored, setStored] = useLocal<Filters>("teamtime.filters", emptyFilters());
  const from = span === "month" ? monthStart(anchor) : weekStart(anchor, ws);
  const to = span === "month" ? monthEnd(anchor) : addDays(from, span === "2weeks" ? 13 : 6);
  const filters: Filters = { ...emptyFilters(), ...stored, range: { from, to, preset: "Custom" } };
  const q = filterQuery(filters);
  const { data, error, loading, reload } = useApi<Resp>("/timesheets/combined", { ...q, groupBy });
  const [drill, setDrill] = useState<{ title: string; query: Record<string, string> } | null>(null);

  const days = range(from, to);
  const shift = (dir: 1 | -1) => {
    if (span === "month") { const d = new Date(anchor + "T00:00:00"); d.setMonth(d.getMonth() + dir, 1); setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`); }
    else setAnchor(addDays(anchor, (span === "2weeks" ? 14 : 7) * dir));
  };
  const dayTotals = days.map((d) => (data?.rows ?? []).reduce((a, r) => a + (r.days[d] ?? 0), 0));
  const billable = (data?.rows ?? []).reduce((a, r) => a + r.billableMinutes, 0);
  const statusFor = (userId?: number) => {
    if (!userId || !data) return null;
    const p = data.periods.filter((x) => x.userId === userId && x.weekStart >= weekStart(from, ws) && x.weekStart <= to);
    return p.length ? p[p.length - 1].status : null;
  };
  const label = span === "month" ? new Date(from + "T00:00:00").toLocaleString("en", { month: "long", year: "numeric" }) : `${fmtDate(from)} – ${fmtDate(to, true)}`;
  const compact = days.length > 14;

  return (
    <Page
      title="Team timesheets" icon={<Users size={15} />}
      actions={<Button size="sm" variant="secondary" icon={<FileSpreadsheet size={14} />} onClick={() => download("/reports/export.xlsx", q)}>Export Excel</Button>}
      toolbar={
        <div className="col" style={{ width: "100%", gap: 8 }}>
          <div className="row wrap">
            <IconButton size="sm" label="Previous" icon={<ChevronLeft size={15} />} onClick={() => shift(-1)} />
            <span className={s.period}>{label}</span>
            <IconButton size="sm" label="Next" icon={<ChevronRight size={15} />} onClick={() => shift(1)} />
            <Button size="sm" variant="ghost" onClick={() => setAnchor(today())}>Today</Button>
            <SegmentedControl aria-label="Span" value={span} onChange={setSpan} options={[{ value: "week", label: "Week" }, { value: "2weeks", label: "2 weeks" }, { value: "month", label: "Month" }]} />
            <div className="grow" />
            <span className="faint small">Rows</span>
            <SegmentedControl aria-label="Group by" value={groupBy} onChange={setGroupBy} options={GROUPS} />
          </div>
          <FilterBar value={filters} onChange={setStored} showRange={false} hide={["status"]} />
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
                {groupBy === "employee" && <th>Status</th>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const st = statusFor(r.userId);
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
                    {groupBy === "employee" && <td>{st ? <Badge size="sm" tone={STATUS_TONE[st] ?? "gray"} dot>{STATUS_LABEL[st] ?? st}</Badge> : <span className="faint small">Open</span>}</td>}
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
                {groupBy === "employee" && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <EntriesSheet open={!!drill} onClose={() => setDrill(null)} title={drill?.title} query={drill?.query ?? null} onChanged={reload} />
    </Page>
  );
}

const isWeekend = (d: string) => { const n = new Date(d + "T00:00:00").getDay(); return n === 0 || n === 6; };
