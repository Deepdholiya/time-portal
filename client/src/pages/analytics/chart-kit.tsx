import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Tooltip } from "@/components/arc";
import { hm, pct } from "@/lib/format";
import s from "./analytics.module.css";

// Shared chart vocabulary: thin bars with rounded data ends, 2px lines, recessive grid, one axis,
// legend for 2+ series, tooltips on hover, text in text tokens and series colours from project colours.

export const SERIES = { billable: "var(--accent)", nonBillable: "var(--border-strong)" } as const;
const axis = { stroke: "var(--border)", tick: { fill: "var(--text-3)", fontSize: 11 }, tickLine: false, axisLine: false } as const;

export interface SeriesDef { key: string; label: string; color: string }

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className={s.legend}>
      {items.map((i) => <span key={i.label} className={s.legendItem}><span className="swatch" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  );
}

function TipBox({ title, rows }: { title: ReactNode; rows: { label: string; color?: string; value: string }[] }) {
  return (
    <div className={s.tip}>
      <div className={s.tipTitle}>{title}</div>
      {rows.map((r) => (
        <div key={r.label} className={s.tipRow}>
          {r.color && <span className="swatch" style={{ background: r.color }} />}
          <span className="muted grow">{r.label}</span>
          <span className="num medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type Row = Record<string, string | number | null | undefined>;

/** Vertical bars over time (minutes values), optionally stacked series. */
export function TimeChart({ data, series, xKey = "label", fmtX = (v: string) => v, height = 200, kind = "bar", onClick }: {
  data: Row[]; series: SeriesDef[]; xKey?: string; fmtX?: (v: string) => string; height?: number; kind?: "bar" | "line"; onClick?: (row: Row) => void;
}) {
  const tip = ({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    const rows = series.map((sd) => ({ label: sd.label, color: sd.color, value: hm(Number(payload.find((p) => p.dataKey === sd.key)?.value ?? 0)) }));
    if (series.length > 1) rows.push({ label: "Total", color: undefined as unknown as string, value: hm(payload.reduce((a, p) => a + Number(p.value ?? 0), 0)) });
    return <TipBox title={fmtX(String(label))} rows={rows} />;
  };
  const yTick = (v: number) => `${+(v / 60).toFixed(1)}h`;
  const barSize = Math.max(4, Math.min(18, Math.floor(560 / Math.max(1, data.length)) - 4));
  return (
    <div>
      {series.length > 1 && <Legend items={series} />}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              <XAxis dataKey={xKey} tickFormatter={fmtX} {...axis} minTickGap={16} />
              <YAxis tickFormatter={yTick} {...axis} width={44} />
              <RTooltip content={tip as never} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} />
              {series.map((sd) => <Line key={sd.key} dataKey={sd.key} stroke={sd.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--bg)" }} isAnimationActive={false} />)}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} onClick={onClick ? (e) => { const p = (e as { activePayload?: { payload: Row }[] })?.activePayload?.[0]?.payload; if (p) onClick(p); } : undefined}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey={xKey} tickFormatter={fmtX} {...axis} minTickGap={8} />
              <YAxis tickFormatter={yTick} {...axis} width={44} />
              <RTooltip content={tip as never} cursor={{ fill: "var(--bg-hover)" }} />
              {series.map((sd, i) => (
                <Bar key={sd.key} dataKey={sd.key} stackId="a" fill={sd.color} barSize={barSize} isAnimationActive={false}
                  radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} stroke="var(--bg)" strokeWidth={series.length > 1 ? 1 : 0}
                  style={onClick ? { cursor: "pointer" } : undefined} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal bar list in HTML: label, thin bar coloured by entity, value. Rows are clickable for drill-down. */
export function BarList({ items, onClick, max, empty = "No time in this range", valueLabel }: {
  items: { key: string; label: ReactNode; sub?: ReactNode; color?: string; minutes: number; billableMinutes?: number; extra?: ReactNode; title?: string }[];
  onClick?: (key: string) => void; max?: number; empty?: string; valueLabel?: (m: number) => ReactNode;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.minutes));
  if (!items.length) return <div className={s.emptyChart}>{empty}</div>;
  return (
    <div className={s.barList}>
      {items.map((i) => (
        <div key={i.key} className={`${s.barRow} ${onClick ? s.clickable : ""}`} onClick={onClick ? () => onClick(i.key) : undefined} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
          onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(i.key); } : undefined}>
          <div className={s.barLabel}>
            <span className="ellipsis">{i.label}</span>
            {i.sub && <span className="faint small ellipsis">{i.sub}</span>}
          </div>
          <Tooltip content={i.title ?? `${hm(i.minutes)}${i.billableMinutes !== undefined ? ` · ${hm(i.billableMinutes)} billable` : ""}`}>
            <div className={s.barTrack}>
              <span className={s.barFill} style={{ width: `${Math.max(1.5, (i.minutes / top) * 100)}%`, background: i.color ?? "var(--accent)" }} />
            </div>
          </Tooltip>
          <div className={s.barValue}>{valueLabel ? valueLabel(i.minutes) : hm(i.minutes)}</div>
          {i.extra}
        </div>
      ))}
    </div>
  );
}

/** Utilisation coloured by company thresholds (status colours carry an icon/label elsewhere). */
export function utilTone(u: number | null | undefined, t = { overloadPct: 100, healthyPct: 80, underPct: 60 }) {
  if (u === null || u === undefined) return { color: "var(--text-3)", label: "No capacity", tone: "gray" as const };
  const p = u * 100;
  if (p > t.overloadPct) return { color: "var(--red)", label: "Overloaded", tone: "red" as const };
  if (p >= t.healthyPct) return { color: "var(--green)", label: "Healthy", tone: "green" as const };
  if (p < t.underPct) return { color: "var(--yellow)", label: "Under-utilised", tone: "yellow" as const };
  return { color: "var(--blue)", label: "OK", tone: "blue" as const };
}

export function UtilBar({ value, thresholds, width = 120 }: { value: number | null | undefined; thresholds?: { overloadPct: number; healthyPct: number; underPct: number }; width?: number }) {
  const t = utilTone(value, thresholds);
  const w = Math.min(100, (value ?? 0) * 100 / 1.25);
  return (
    <Tooltip content={`${pct(value)} · ${t.label}`}>
      <div className="row gap-4" style={{ width }}>
        <div className={s.utilTrack}>
          <span className={s.barFill} style={{ width: `${w}%`, background: t.color }} />
          <span className={s.utilMark} style={{ left: `${100 / 1.25}%` }} />
        </div>
        <span className="num small" style={{ width: 38, textAlign: "right" }}>{value == null ? "—" : pct(value)}</span>
      </div>
    </Tooltip>
  );
}

export function ChartCard({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${s.chartCard} ${className ?? ""}`}>
      <header className={s.chartHead}><h3>{title}</h3><div className="grow" />{action}</header>
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={s.kpi}>
      <div className="stat-label">{icon}{label}</div>
      <div className={s.kpiValue}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
