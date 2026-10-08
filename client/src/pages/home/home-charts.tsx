import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays, dayName, fmtDate, hm, range, weekStart } from "@/lib/format";
import s from "./home.module.css";

export interface Group { key: string; id: number | string; name: string; color?: string; sub?: string; minutes: number; billableMinutes: number; entries: number }

/** Hours per day (per week for long ranges), split billable / non-billable. */
export function HoursByDay({ byDay, from, to }: { byDay: Group[]; from: string; to: string }) {
  const map = new Map(byDay.map((d) => [String(d.id), d]));
  const days = range(from, to);
  const weekly = days.length > 31;
  const buckets = new Map<string, { label: string; billable: number; non: number; title: string }>();
  for (const d of days) {
    const k = weekly ? weekStart(d) : d;
    const b = buckets.get(k) ?? { label: weekly ? fmtDate(k) : `${dayName(d)} ${Number(d.slice(8))}`, billable: 0, non: 0, title: weekly ? `Week of ${fmtDate(k)} – ${fmtDate(addDays(k, 6))}` : fmtDate(d) };
    const g = map.get(d);
    if (g) { b.billable += g.billableMinutes / 60; b.non += (g.minutes - g.billableMinutes) / 60; }
    buckets.set(k, b);
  }
  const data = [...buckets.values()];
  const total = data.reduce((a, b) => a + b.billable + b.non, 0);
  if (!total) return <div className="small faint" style={{ padding: "40px 0", textAlign: "center" }}>No time tracked in this period.</div>;
  return (
    <>
      <div className={s.legend} style={{ marginBottom: 8 }}>
        <span><span className="swatch" style={{ background: "var(--accent)" }} />Billable</span>
        <span><span className="swatch" style={{ background: "var(--text-3)", opacity: 0.45 }} />Non-billable</span>
      </div>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap={data.length > 12 ? "18%" : "32%"}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--text-3)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-3)", fontSize: 11 }} allowDecimals={false} width={44} tickFormatter={(v: number) => `${v}h`} />
            <Tooltip
              cursor={{ fill: "var(--bg-hover)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className={s.chartTip}>
                    <div className="medium" style={{ marginBottom: 2 }}>{p.title}</div>
                    <div className="row between gap-16"><span className="muted">Billable</span><span className="num">{hm(p.billable * 60)}</span></div>
                    <div className="row between gap-16"><span className="muted">Non-billable</span><span className="num">{hm(p.non * 60)}</span></div>
                    <div className="row between gap-16" style={{ borderTop: "1px solid var(--border)", marginTop: 3, paddingTop: 3 }}><span className="muted">Total</span><span className="num strong">{hm((p.billable + p.non) * 60)}</span></div>
                  </div>
                );
              }}
            />
            <Bar dataKey="billable" stackId="h" fill="var(--accent)" maxBarSize={22} stroke="var(--bg)" strokeWidth={1} />
            <Bar dataKey="non" stackId="h" fill="var(--text-3)" fillOpacity={0.45} maxBarSize={22} radius={[3, 3, 0, 0]} stroke="var(--bg)" strokeWidth={1} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Project share of time as thin horizontal meters, coloured by each project's own colour. */
export function HoursByProject({ groups, onOpen }: { groups: Group[]; onOpen?: (g: Group) => void }) {
  if (!groups.length) return <div className="small faint" style={{ padding: "16px 0", textAlign: "center" }}>No project time in this period.</div>;
  const total = groups.reduce((a, g) => a + g.minutes, 0);
  const max = Math.max(...groups.map((g) => g.minutes));
  return (
    <div>
      {groups.slice(0, 8).map((g) => (
        <div key={g.key} className={s.projRow} title={`${g.name}${g.sub ? ` · ${g.sub}` : ""}: ${hm(g.minutes)} (${Math.round((g.minutes / total) * 100)}%), ${hm(g.billableMinutes)} billable`} onClick={() => onOpen?.(g)} style={{ cursor: onOpen ? "pointer" : undefined }}>
          <span className="row gap-4" style={{ minWidth: 0, gap: 7 }}><span className="swatch" style={{ background: g.color ?? "var(--text-3)", width: 8, height: 8 }} /><span className="ellipsis">{g.name}</span></span>
          <span className={s.track}><span style={{ width: `${(g.minutes / max) * 100}%`, background: g.color ?? "var(--accent)" }} /></span>
          <span className="num right muted">{hm(g.minutes)}</span>
        </div>
      ))}
      {groups.length > 8 && <div className="small faint" style={{ paddingTop: 4 }}>+{groups.length - 8} more projects</div>}
    </div>
  );
}
