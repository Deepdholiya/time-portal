import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Gauge, Plane } from "lucide-react";
import { Avatar, Badge, Button, EmptyState, IconButton, SegmentedControl, Select, SkeletonRows, Tooltip } from "@/components/arc";
import { Page } from "@/components/app/page";
import { get } from "@/lib/api";
import { useApi, useLocal } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { addDays, dayName, fmtDate, range, today, weekStart } from "@/lib/format";
import type { Options } from "@/lib/types";
import { LoadError } from "../analytics/entries";
import { WorkloadSheet } from "./person-sheet";
import s from "./workload.module.css";

export interface WTask {
  id: number; key: string; title: string; status: string; priority: string; dueDate: string | null; startDate: string | null; estimateHours: number | null;
  remainingHours: number; plannedHours: number; project: { id: number; name: string; color: string }; overdue: boolean;
}
export interface WRow {
  user: { id: number; name: string; title: string | null }; team: string | null; capacityHours: number; plannedHours: number; trackedHours: number; remainingHours: number;
  leaveDays: number; utilization: number | null; plannedUtilization: number | null; status: "OVERLOADED" | "HEALTHY" | "UNDERUTILIZED" | "OK"; tasks: WTask[];
}
export interface WResp { thresholds: { overloadPct: number; healthyPct: number; underPct: number }; workingDays: number; rows: WRow[] }

export const STATUS: Record<WRow["status"], { label: string; tone: "red" | "green" | "yellow" | "blue"; color: string }> = {
  OVERLOADED: { label: "Overloaded", tone: "red", color: "var(--red)" },
  HEALTHY: { label: "Healthy", tone: "green", color: "var(--green)" },
  OK: { label: "Moderate", tone: "blue", color: "var(--blue)" },
  UNDERUTILIZED: { label: "Under-utilised", tone: "yellow", color: "var(--yellow)" },
};
const toneFor = (p: number | null, t: WResp["thresholds"]) => (p == null ? null : p * 100 > t.overloadPct ? "OVERLOADED" : p * 100 >= t.healthyPct ? "HEALTHY" : p * 100 < t.underPct ? "UNDERUTILIZED" : "OK");
const h1 = (n: number) => (Math.round(n * 10) / 10).toString();

type Span = 1 | 2 | 4 | 6;
type Grain = "week" | "day";
type Metric = "planned" | "tracked";

export default function Workload() {
  const { me } = useMe();
  const ws = me.company.weekStartsOn ?? 1;
  const [weeks, setWeeks] = useLocal<Span>("workload.weeks", 4);
  const [grain, setGrain] = useLocal<Grain>("workload.grain", "week");
  const [metric, setMetric] = useLocal<Metric>("workload.metric", "planned");
  const [teamId, setTeamId] = useLocal<string>("workload.team", "");
  const [anchor, setAnchor] = useState(weekStart(today(), ws));
  const from = anchor;
  const to = addDays(from, weeks * 7 - 1);
  const effGrain: Grain = grain === "day" && weeks <= 2 ? "day" : "week";
  const buckets = useMemo(() => effGrain === "day"
    ? range(from, to).map((d) => ({ from: d, to: d, label: `${dayName(d)} ${d.slice(8)}` }))
    : Array.from({ length: weeks }, (_, i) => { const f = addDays(from, i * 7); return { from: f, to: addDays(f, 6), label: fmtDate(f) }; }), [effGrain, from, to, weeks]);

  const { data: opts } = useApi<Options>("/options");
  const { data, error, loading, reload } = useApi<WResp>("/analytics/workload", { from, to, teamId: teamId || undefined });
  const [cells, setCells] = useState<Record<string, WResp>>({});
  useEffect(() => {
    let live = true;
    setCells({});
    Promise.all(buckets.map((b) => get<WResp>("/analytics/workload", { from: b.from, to: b.to, teamId: teamId || undefined }).then((r) => [b.from, r] as const).catch(() => null)))
      .then((res) => { if (live) setCells(Object.fromEntries(res.filter(Boolean) as [string, WResp][])); });
    return () => { live = false; };
  }, [buckets, teamId]);
  const [person, setPerson] = useState<WRow | null>(null);

  const t = data?.thresholds ?? { overloadPct: 100, healthyPct: 80, underPct: 60 };
  const counts = (data?.rows ?? []).reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <Page
      title="Workload" icon={<Gauge size={15} />}
      toolbar={
        <div className="row wrap" style={{ width: "100%" }}>
          <IconButton size="sm" label="Previous" icon={<ChevronLeft size={15} />} onClick={() => setAnchor(addDays(anchor, -7 * weeks))} />
          <span className={s.period}>{fmtDate(from)} – {fmtDate(to, true)}</span>
          <IconButton size="sm" label="Next" icon={<ChevronRight size={15} />} onClick={() => setAnchor(addDays(anchor, 7 * weeks))} />
          <Button size="sm" variant="ghost" onClick={() => setAnchor(weekStart(today(), ws))}>This week</Button>
          <SegmentedControl aria-label="Weeks" value={String(weeks)} onChange={(v) => setWeeks(Number(v) as Span)}
            options={[{ value: "1", label: "1 wk" }, { value: "2", label: "2 wks" }, { value: "4", label: "4 wks" }, { value: "6", label: "6 wks" }]} />
          <SegmentedControl aria-label="Columns" value={effGrain} onChange={(g) => { setGrain(g); if (g === "day" && weeks > 2) setWeeks(2); }}
            options={[{ value: "week", label: "By week" }, { value: "day", label: "By day" }]} />
          <SegmentedControl aria-label="Metric" value={metric} onChange={setMetric}
            options={[{ value: "planned", label: "Planned" }, { value: "tracked", label: "Logged" }]} />
          <Select size="sm" fullWidth={false} value={teamId} onChange={setTeamId} aria-label="Team"
            options={[{ value: "", label: "All teams" }, ...(opts?.teams ?? []).map((x) => ({ value: String(x.id), label: x.name }))]} />
          <div className="grow" />
          <div className={s.legend}>
            {(Object.keys(STATUS) as WRow["status"][]).map((k) => (
              <Tooltip key={k} content={k === "OVERLOADED" ? `Over ${t.overloadPct}%` : k === "HEALTHY" ? `${t.healthyPct}–${t.overloadPct}%` : k === "UNDERUTILIZED" ? `Under ${t.underPct}%` : `${t.underPct}–${t.healthyPct}%`}>
                <span className="row gap-4"><span className="swatch" style={{ background: STATUS[k].color }} /><span className="small muted">{STATUS[k].label}</span>{counts[k] ? <span className="small faint">{counts[k]}</span> : null}</span>
              </Tooltip>
            ))}
          </div>
        </div>
      }
    >
      {error ? <LoadError error={error} onRetry={reload} what="workload" /> : loading && !data ? <SkeletonRows rows={10} /> : !data?.rows.length ? (
        <EmptyState title="No people" description="Nobody active in this team." />
      ) : (
        <div className="table-wrap" style={{ height: "100%" }}>
          <table className={`table ${s.table}`}>
            <thead>
              <tr>
                <th className={s.sticky}>Person</th>
                <th className="num">Capacity</th>
                <th className="num">Planned</th>
                <th className="num">Logged</th>
                <th className="num">Remaining</th>
                <th style={{ width: 170 }}>{metric === "planned" ? "Planned" : "Logged"} vs capacity</th>
                <th>Status</th>
                {buckets.map((b) => <th key={b.from} className={`center ${s.bucketHead}`}>{b.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const u = metric === "planned" ? r.plannedUtilization : r.utilization;
                const st = STATUS[(toneFor(u, t) ?? "UNDERUTILIZED") as WRow["status"]];
                return (
                  <tr key={r.user.id} className="clickable" onClick={() => setPerson(r)}>
                    <td className={s.sticky}>
                      <div className="row"><Avatar name={r.user.name} size={20} /><div className={s.who}><span className="medium ellipsis">{r.user.name}</span><span className="faint tiny ellipsis">{r.team ?? r.user.title ?? ""}</span></div></div>
                    </td>
                    <td className="num">{h1(r.capacityHours)}h{r.leaveDays > 0 && <Tooltip content={`${r.leaveDays} day(s) of approved leave`}><span className={s.leave}><Plane size={11} />{r.leaveDays}d</span></Tooltip>}</td>
                    <td className="num">{h1(r.plannedHours)}h</td>
                    <td className="num muted">{h1(r.trackedHours)}h</td>
                    <td className="num muted">{h1(r.remainingHours)}h</td>
                    <td>
                      <div className={s.meter}>
                        <div className={s.meterTrack}><span style={{ width: `${Math.min(100, ((u ?? 0) * 100) / 1.5)}%`, background: st.color }} /><i style={{ left: `${100 / 1.5}%` }} /></div>
                        <span className="num small">{u == null ? "—" : `${Math.round(u * 100)}%`}</span>
                      </div>
                    </td>
                    <td><Badge size="sm" tone={st.tone} dot>{st.label}</Badge></td>
                    {buckets.map((b) => {
                      const c = cells[b.from]?.rows.find((x) => x.user.id === r.user.id);
                      if (!c) return <td key={b.from} className="center faint">{cells[b.from] ? "–" : "…"}</td>;
                      const cu = metric === "planned" ? c.plannedUtilization : c.utilization;
                      const ck = toneFor(cu, t) as WRow["status"] | null;
                      const hrs = metric === "planned" ? c.plannedHours : c.trackedHours;
                      const onLeave = c.leaveDays > 0;
                      return (
                        <td key={b.from} className={`center ${s.bucket}`}>
                          <Tooltip content={`${b.label}: ${h1(hrs)}h ${metric} of ${h1(c.capacityHours)}h capacity${onLeave ? ` · ${c.leaveDays}d leave` : ""}`}>
                            <span className={s.heat} style={{ background: c.capacityHours === 0 || !cu ? "transparent" : ck ? `color-mix(in srgb, ${STATUS[ck].color} ${Math.min(55, 12 + (cu ?? 0) * 30)}%, transparent)` : "transparent" }}>
                              {c.capacityHours === 0 ? (onLeave ? <Plane size={12} className="faint" /> : <span className="faint">–</span>) : <>{cu == null ? "—" : `${Math.round(cu * 100)}%`}{onLeave && <Plane size={10} className={s.leaveIcon} />}</>}
                            </span>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <WorkloadSheet row={person} onClose={() => setPerson(null)} from={from} to={to} />
    </Page>
  );
}
