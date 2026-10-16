import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { X, Timer, BadgeDollarSign, FolderKanban, Building2, Gauge } from "lucide-react";
import { Button } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { addDays, fmtDate, fmtDay, hm, pct, range, weekStart } from "@/lib/format";
import { BarList, ChartCard, Kpi, Legend, UtilBar } from "./chart-kit";
import type { AnalyticsData } from "./types";
import s from "./analytics.module.css";

type Drill = { title: string; query: Record<string, string> } | null;
const OTHER = "var(--border-strong)";
const MAX_SERIES = 7;

/**
 * Dashboard in the shape of Clockify's: totals with the top project and client, time per day stacked by project,
 * a donut of the project split with percentages, and the most tracked activities. Team breakdowns follow for admins.
 */
export function Overview({ data, q, own, single, weekStartsOn, focused, onProject, onClearProject, onDrill }: {
  data: AnalyticsData; q: Record<string, string>; own: boolean; single: boolean; weekStartsOn: number; focused?: AnalyticsData["byProject"][number];
  onProject: (id: number) => void; onClearProject: () => void; onDrill: (d: Drill) => void;
}) {
  const k = data.kpis;
  const total = Math.max(1, k.totalMinutes);
  const topProject = data.byProject[0];
  const topClient = data.byClient.find((c) => c.id !== null);

  // Top projects keep their colours; the rest fold into "Other" so the chart and donut stay readable.
  const series = useMemo(() => {
    const top = data.byProject.slice(0, MAX_SERIES);
    const rest = data.byProject.slice(MAX_SERIES);
    const list = top.map((p) => ({ key: `p${p.id}`, id: p.id as number, label: p.name, color: p.color ?? "var(--accent)", minutes: p.minutes }));
    if (rest.length) list.push({ key: "other", id: -1, label: `Other (${rest.length})`, color: OTHER, minutes: rest.reduce((a, p) => a + p.minutes, 0) });
    return list;
  }, [data.byProject]);

  // Every day of the range gets a bar (empty days included), or every week when the range is long.
  const weekly = range(q.from, q.to).length > 45;
  const bars = useMemo(() => {
    const seriesOf = (pid: number) => (series.some((x) => x.id === pid) ? `p${pid}` : "other");
    const buckets = weekly
      ? [...new Set(range(q.from, q.to).map((d) => weekStart(d, weekStartsOn)))]
      : range(q.from, q.to);
    const rows = new Map(buckets.map((b) => [b, { label: b, total: 0 } as Record<string, number | string>]));
    for (const r of data.byDayProject) {
      const b = weekly ? weekStart(r.day, weekStartsOn) : r.day;
      const row = rows.get(b); if (!row) continue;
      const key = seriesOf(r.projectId);
      row[key] = Number(row[key] ?? 0) + r.minutes;
      row.total = Number(row.total) + r.minutes;
    }
    return [...rows.values()];
  }, [data.byDayProject, series, q.from, q.to, weekly, weekStartsOn]);

  const fmtX = (v: string) => (weekly ? `Wk ${fmtDate(v)}` : bars.length <= 7 ? fmtDay(v) : fmtDate(v));
  const tip = ({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    const rows = series.map((x) => ({ ...x, v: Number(payload.find((p) => p.dataKey === x.key)?.value ?? 0) })).filter((x) => x.v > 0);
    return (
      <div className={s.tip}>
        <div className={s.tipTitle}>{weekly ? `Week of ${fmtDate(String(label), true)}` : fmtDate(String(label), true)}</div>
        {rows.map((r) => <div key={r.key} className={s.tipRow}><span className="swatch" style={{ background: r.color }} /><span className="muted grow ellipsis">{r.label}</span><span className="num medium">{hm(r.v)}</span></div>)}
        <div className={s.tipRow} style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 2 }}><span className="grow">Total</span><span className="num medium">{hm(rows.reduce((a, r) => a + r.v, 0))}</span></div>
      </div>
    );
  };
  const barSize = Math.max(6, Math.min(36, Math.floor(760 / Math.max(1, bars.length)) - 6));

  return (
    <>
      {focused && (
        <div className={s.focus}>
          <ProjectDot color={focused.color} />
          <span>Focused on <span className="medium">{focused.name}</span>{focused.sub && <span className="faint"> · {focused.sub}</span>}</span>
          <div className="grow" />
          <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={onClearProject}>Clear focus</Button>
        </div>
      )}
      <div className={s.kpis}>
        <Kpi icon={<Timer />} label="Total time" value={hm(k.totalMinutes)} sub={`${k.entries} entries`} />
        <Kpi icon={<BadgeDollarSign />} label="Billable" value={hm(k.billableMinutes)} sub={k.totalMinutes ? `${pct(k.billableMinutes / total)} of total` : "—"} />
        <Kpi icon={<FolderKanban />} label="Top project" value={<span className={s.kpiText}>{topProject ? <><ProjectDot color={topProject.color} />{topProject.name}</> : "—"}</span>} sub={topProject ? `${hm(topProject.minutes)} · ${pct(topProject.minutes / total)}` : undefined} />
        <Kpi icon={<Building2 />} label="Top client" value={<span className={s.kpiText}>{topClient?.name ?? "—"}</span>} sub={topClient ? `${hm(topClient.minutes)} · ${pct(topClient.minutes / total)}` : undefined} />
        <Kpi icon={<Gauge />} label="Utilisation" value={k.utilization == null ? "—" : pct(k.utilization)} sub={`of ${hm(k.capacityMinutes)} capacity`} />
      </div>

      <div className={s.charts}>
        <ChartCard title={weekly ? "Time by week" : "Time by day"} className={s.span12} action={<span className="faint small">Click a bar for its entries</span>}>
          {k.totalMinutes ? (
            <>
              <Legend items={series} />
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} margin={{ top: 18, right: 8, left: -12, bottom: 0 }}
                    onClick={(e) => { const d = (e as { activeLabel?: string })?.activeLabel; if (d) onDrill({ title: weekly ? `Week of ${fmtDate(d, true)}` : `Entries on ${fmtDate(d, true)}`, query: { ...q, from: d < q.from ? q.from : d, to: weekly ? minDate(addDays(d, 6), q.to) : d } }); }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickFormatter={fmtX} stroke="var(--border)" tick={{ fill: "var(--text-3)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={8} />
                    <YAxis tickFormatter={(v: number) => `${+(v / 60).toFixed(1)}h`} stroke="var(--border)" tick={{ fill: "var(--text-3)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                    <RTooltip content={tip as never} cursor={{ fill: "var(--bg-hover)" }} />
                    {series.map((x, i) => (
                      <Bar key={x.key} dataKey={x.key} stackId="a" fill={x.color} barSize={barSize} isAnimationActive={false} style={{ cursor: "pointer" }}
                        radius={i === series.length - 1 ? [3, 3, 0, 0] : 0} stroke="var(--bg)" strokeWidth={1}
                      >
                        {i === series.length - 1 && bars.length <= 31 && <LabelList dataKey="total" position="top" fontSize={10} fill="var(--text-3)" formatter={(v: unknown) => (Number(v) ? short(Number(v)) : "")} />}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : <div className={s.emptyChart}>No time in this range</div>}
        </ChartCard>

        <ChartCard title="Projects" className={s.span6} action={<span className="faint small">Click to focus</span>}>
          {k.totalMinutes ? (
            <div className={s.donutWrap}>
              <div className={s.donut}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={series} dataKey="minutes" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={series.length > 1 ? 1 : 0} stroke="none" isAnimationActive={false}
                      onClick={(d: { id?: number }) => d.id && d.id > 0 && onProject(d.id)}>
                      {series.map((x) => <Cell key={x.key} fill={x.color} style={{ cursor: x.id > 0 ? "pointer" : undefined }} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className={s.donutCenter}><div className="num medium">{hm(k.totalMinutes)}</div><div className="faint small">total</div></div>
              </div>
              <div className={s.splitList}>
                {series.map((x) => (
                  <button key={x.key} type="button" className={s.splitRow} disabled={x.id < 0} onClick={() => onProject(x.id)}>
                    <span className="swatch" style={{ background: x.color }} />
                    <span className="ellipsis grow">{x.label}</span>
                    <span className="num small muted">{hm(x.minutes)}</span>
                    <span className={`num small ${s.splitPct}`}>{pct(x.minutes / total, 1)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : <div className={s.emptyChart}>No time in this range</div>}
        </ChartCard>

        <ChartCard title="Most tracked activities" className={s.span6} action={<span className="faint small">Top 10 · click for entries</span>}>
          {data.activities.length ? (
            <table className={s.actTable}>
              <tbody>
                {data.activities.map((a, i) => (
                  <tr key={a.key} onClick={() => onDrill({ title: a.name, query: a.taskId ? { ...q, taskId: String(a.taskId) } : { ...q, projectId: String(a.projectId), ...(a.name === "(no description)" ? {} : { q: a.name }) } })}>
                    <td className="faint num">{i + 1}</td>
                    <td><div className="ellipsis medium">{a.name}</div><div className="row gap-4 small muted"><ProjectDot color={a.color} /><span className="ellipsis">{a.project}</span></div></td>
                    <td className={s.actBar}><span style={{ width: `${(a.minutes / data.activities[0].minutes) * 100}%`, background: a.color }} /></td>
                    <td className="num right">{hm(a.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className={s.emptyChart}>No time in this range</div>}
        </ChartCard>

        {!own && !single && (
          <ChartCard title={focused ? `Employees on ${focused.name}` : "By employee"} className={s.span6} action={<span className="faint small">Logged vs capacity · click for entries</span>}>
            {data.byEmployee.length ? (
              <div className={s.barList}>
                {data.byEmployee.map((e) => (
                  <div key={e.key} className={`${s.barRow} ${s.clickable}`} style={{ gridTemplateColumns: "minmax(110px, 34%) 1fr 64px" }} role="button" tabIndex={0}
                    onClick={() => onDrill({ title: e.name, query: { ...q, userId: String(e.id) } })}>
                    <div className={s.barLabel}><span className="ellipsis">{e.name}</span><span className="faint small">{e.leaveDays ? `${e.leaveDays}d leave · ` : ""}{e.daysWorked}/{e.workingDays} days</span></div>
                    <UtilBar value={e.utilization} width={220} />
                    <span className="num small right">{hm(e.minutes)}</span>
                  </div>
                ))}
              </div>
            ) : <div className={s.emptyChart}>No people in range</div>}
          </ChartCard>
        )}
        <ChartCard title="By client" className={!own && !single ? s.span6 : s.span6}>
          <BarList items={data.byClient.map((c) => ({ key: String(c.id), label: c.name, minutes: c.minutes, billableMinutes: c.billableMinutes, color: "var(--accent)" }))}
            onClick={(id) => id !== "null" && onDrill({ title: data.byClient.find((c) => String(c.id) === id)?.name ?? "Client", query: { ...q, clientId: id } })} />
        </ChartCard>
        <ChartCard title="By sub-project" className={s.span6}>
          <BarList items={data.bySubProject.slice(0, 10).map((c) => ({ key: String(c.id), label: c.name, sub: c.sub, minutes: c.minutes, billableMinutes: c.billableMinutes, color: c.color }))}
            onClick={(id) => id !== "null" && onDrill({ title: data.bySubProject.find((c) => String(c.id) === id)?.name ?? "Sub-project", query: { ...q, subProjectId: id } })} />
        </ChartCard>
        {!own && !single && data.byTeam.length > 0 && (
          <ChartCard title="By team" className={s.span6}>
            <BarList items={data.byTeam.map((c) => ({ key: String(c.id), label: c.name, minutes: c.minutes, billableMinutes: c.billableMinutes, color: "var(--accent)" }))}
              onClick={(id) => id !== "null" && onDrill({ title: data.byTeam.find((c) => String(c.id) === id)?.name ?? "Team", query: { ...q, teamId: id } })} />
          </ChartCard>
        )}
      </div>
    </>
  );
}

const short = (m: number) => (m >= 600 ? `${Math.round(m / 60)}h` : m >= 60 ? `${+(m / 60).toFixed(1)}h` : `${m}m`);
const minDate = (a: string, b: string) => (a < b ? a : b);
