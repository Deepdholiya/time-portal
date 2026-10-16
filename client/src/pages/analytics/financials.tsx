import { EmptyState, SkeletonRows } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { money, pct } from "@/lib/format";
import { ChartCard, Kpi, Legend } from "./chart-kit";
import { LoadError } from "./entries";
import type { Group } from "./types";
import s from "./analytics.module.css";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";

interface MoneyGroup extends Group { revenue: number; cost: number; profit?: number }
interface ProjectFin extends MoneyGroup {
  profit: number; margin: number | null; budget: number | null; billingType?: string; budgetConsumed: number | null; budgetRemaining: number | null; budgetVariance: number | null; hourVariance: number | null;
}
interface FinData {
  currency: string;
  totals: { revenue: number; cost: number; profit: number; margin: number | null; billableHours: number };
  byProject: ProjectFin[]; byClient: MoneyGroup[]; byEmployee?: MoneyGroup[]; byMonth: MoneyGroup[];
}

/** Revenue, cost, profit, margin and budget burn. Only mounted when the user can view financials. */
export function Financials({ query }: { query: Record<string, string> }) {
  const { data, error, loading, reload } = useApi<FinData>("/analytics/financials", query);
  const { currency } = useMe();
  if (error) return <LoadError error={error} onRetry={reload} what="financial data" />;
  if (loading && !data) return <SkeletonRows rows={8} />;
  if (!data) return null;
  const cur = data.currency || currency;
  const m = (n: number | null | undefined) => money(n, cur);
  const t = data.totals;
  const tip = ({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: string }) =>
    active && payload?.length ? (
      <div className={s.tip}><div className={s.tipTitle}>{label}</div>
        {payload.map((p) => <div key={p.dataKey} className={s.tipRow}><span className="swatch" style={{ background: p.color }} /><span className="muted grow">{p.dataKey === "revenue" ? "Revenue" : "Cost"}</span><span className="num medium">{m(p.value)}</span></div>)}
      </div>
    ) : null;
  return (
    <div>
      <div className={s.kpis}>
        <Kpi label="Revenue" value={m(t.revenue)} sub={`${t.billableHours.toFixed(1)} billable hours`} />
        <Kpi label="Cost" value={m(t.cost)} />
        <Kpi label="Profit" value={<span className={t.profit < 0 ? "danger" : ""}>{m(t.profit)}</span>} />
        <Kpi label="Margin" value={t.margin == null ? "—" : pct(t.margin)} />
      </div>
      <div className={s.charts}>
        <ChartCard title="Revenue and cost by month" className={s.span12}>
          <Legend items={[{ label: "Revenue", color: "var(--accent)" }, { label: "Cost", color: "var(--border-strong)" }]} />
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={data.byMonth} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--text-3)", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v: number) => m(v)} width={80} />
                <RTooltip content={tip as never} cursor={{ fill: "var(--bg-hover)" }} />
                <Bar dataKey="revenue" fill="var(--accent)" barSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="cost" fill="var(--border-strong)" barSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <section className={`${s.panel} ${s.span12}`}>
          <div className={s.panelHead}><span className="medium">Projects: profit and budget burn</span></div>
          {!data.byProject.length ? <EmptyState compact title="No billable time in range" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Project</th><th className="num">Hours</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Profit</th><th className="num">Margin</th><th className="num">Budget</th><th style={{ width: 180 }}>Budget burn</th><th className="num">Hour variance</th></tr></thead>
                <tbody>
                  {data.byProject.map((p) => {
                    const burn = p.budget && p.budgetConsumed != null ? p.budgetConsumed / p.budget : null;
                    return (
                      <tr key={p.key}>
                        <td><div className="row"><ProjectDot color={p.color} /><span className="medium">{p.name}</span><span className="faint small">{p.billingType?.toLowerCase().replace("_", "-")}</span></div></td>
                        <td className="num">{(p.minutes / 60).toFixed(1)}</td>
                        <td className="num">{m(p.revenue)}</td>
                        <td className="num muted">{m(p.cost)}</td>
                        <td className={`num ${p.profit < 0 ? "danger" : ""}`}>{m(p.profit)}</td>
                        <td className="num">{p.margin == null ? "—" : pct(p.margin)}</td>
                        <td className="num muted">{p.budget ? m(p.budget) : "—"}</td>
                        <td>
                          {burn == null ? <span className="faint">—</span> : (
                            <div className="row gap-4">
                              <div className="progress" style={{ flex: 1 }}><span style={{ width: `${Math.min(100, burn * 100)}%`, background: burn > 1 ? "var(--red)" : burn > 0.85 ? "var(--yellow)" : "var(--accent)" }} /></div>
                              <span className="num small" style={{ width: 40, textAlign: "right" }}>{pct(burn)}</span>
                            </div>
                          )}
                        </td>
                        <td className={`num ${p.hourVariance && p.hourVariance > 0 ? "danger" : "muted"}`}>{p.hourVariance == null ? "—" : `${p.hourVariance > 0 ? "+" : ""}${p.hourVariance.toFixed(0)}h`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className={`${s.panel} ${data.byEmployee ? s.span6 : s.span12}`}>
          <div className={s.panelHead}><span className="medium">By client</span></div>
          <table className="table"><thead><tr><th>Client</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Profit</th></tr></thead>
            <tbody>{data.byClient.map((c) => <tr key={c.key}><td>{c.name}</td><td className="num">{m(c.revenue)}</td><td className="num muted">{m(c.cost)}</td><td className="num">{m(c.profit)}</td></tr>)}</tbody>
          </table>
        </section>
        {data.byEmployee && (
          <section className={`${s.panel} ${s.span6}`}>
            <div className={s.panelHead}><span className="medium">By employee</span><span className="faint small">cost rates are admin-only</span></div>
            <table className="table"><thead><tr><th>Employee</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Profit</th></tr></thead>
              <tbody>{data.byEmployee.map((c) => <tr key={c.key}><td>{c.name}</td><td className="num">{m(c.revenue)}</td><td className="num muted">{m(c.cost)}</td><td className="num">{m(c.profit)}</td></tr>)}</tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
