import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, qs } from "../api";
import { useApp } from "../state";
import { addDays, fmtDay, fmtH, fmtHours, fmtPct, isoDate, parseISO, startOfWeek } from "../lib";
import { Icon } from "../components/Icons";
import { initials } from "../App";

type Group = { key: number | string; name?: string; color?: string; minutes: number; billableMinutes: number; entries: number; [k: string]: unknown };
type Result = {
  scope: "own" | "all";
  kpis: { totalMinutes: number; billableMinutes: number; entries: number; people: number; projects: number; utilization: number | null };
  byEmployee: Group[]; byProject: Group[]; bySubProject: Group[]; byDay: Group[]; byTask: Group[];
  matrix: (Group & { projectId: number; project: string; userId: number; user: string })[];
  entries: { id: number; date: string; startTime: string | null; endTime: string | null; minutes: number; description: string; billable: boolean; user: { id: number; name: string }; project: string; projectColor: string; subProject: string | null; task: string | null; client: string | null }[];
  truncated: boolean;
};

const PRESETS: Record<string, () => [Date, Date]> = {
  "This week": () => [startOfWeek(new Date()), addDays(startOfWeek(new Date()), 6)],
  "Last week": () => [addDays(startOfWeek(new Date()), -7), addDays(startOfWeek(new Date()), -1)],
  "This month": () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)]; },
  "Last month": () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 0)]; },
  "This quarter": () => { const d = new Date(); const q = Math.floor(d.getMonth() / 3) * 3; return [new Date(d.getFullYear(), q, 1), new Date(d.getFullYear(), q + 3, 0)]; },
  "Last 90 days": () => [addDays(new Date(), -89), new Date()],
};

const INK = { grid: "var(--grid)", axis: "var(--muted)" };
const SERIES = "var(--series-1)";

function ChartTip({ active, payload, label, fmtLabel }: { active?: boolean; payload?: { payload: Group }[]; label?: string; fmtLabel?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{fmtLabel ? fmtLabel(String(label ?? g.key)) : g.name ?? label}</strong>
      <div><span className="muted">Total</span> {fmtHours(g.minutes)}</div>
      <div><span className="muted">Billable</span> {fmtHours(g.billableMinutes)}</div>
      <div><span className="muted">Entries</span> {g.entries}</div>
      {typeof g.utilization === "number" && <div><span className="muted">Utilization</span> {fmtPct(g.utilization)}</div>}
    </div>
  );
}

export function Analytics() {
  const { options, perms, toast } = useApp();
  const [preset, setPreset] = useState("This month");
  const [[from, to], setRange] = useState(() => PRESETS["This month"]().map(isoDate) as [string, string]);
  const [f, setF] = useState({ clientId: "", projectId: "", subProjectId: "", teamId: "", userId: "", billable: "", q: "" });
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(50);
  const own = perms!.analytics === "own";

  const set = (k: keyof typeof f, v: string) => setF((x) => {
    const n = { ...x, [k]: v };
    if (k === "clientId") { n.projectId = ""; n.subProjectId = ""; }
    if (k === "projectId") n.subProjectId = "";
    return n;
  });
  const query = qs({ from, to, ...f });

  useEffect(() => {
    setLoading(true); setShown(50);
    setShown(50);
    const t = setTimeout(() => api<Result>(`/analytics?${query}`).then(setData).catch((e) => toast(e.message, "error")).finally(() => setLoading(false)), f.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [query]);

  const all = options?.allProjects ?? [];
  const tops = all.filter((p) => !p.parentId && (!f.clientId || String(p.clientId) === f.clientId));
  const subs = all.filter((p) => f.projectId && String(p.parentId) === f.projectId);
  const users = (options?.users ?? []).filter((u) => !f.teamId || String(u.teamId) === f.teamId);

  // Long ranges are bucketed by week so the bars stay readable.
  const series = useMemo(() => {
    if (!data) return [];
    const days = (parseISO(to).getTime() - parseISO(from).getTime()) / 864e5;
    if (days <= 45) {
      const out: Group[] = [];
      for (let d = parseISO(from); d <= parseISO(to); d = addDays(d, 1)) {
        const k = isoDate(d);
        out.push(data.byDay.find((g) => g.key === k) ?? { key: k, minutes: 0, billableMinutes: 0, entries: 0 });
      }
      return out;
    }
    const weeks = new Map<string, Group>();
    for (const g of data.byDay) {
      const k = isoDate(startOfWeek(parseISO(String(g.key))));
      const w = weeks.get(k) ?? { key: k, minutes: 0, billableMinutes: 0, entries: 0 };
      w.minutes += g.minutes; w.billableMinutes += g.billableMinutes; w.entries += g.entries;
      weeks.set(k, w);
    }
    return [...weeks.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }, [data, from, to]);
  const weekly = series.length && (parseISO(to).getTime() - parseISO(from).getTime()) / 864e5 > 45;

  const exportCsv = () => { window.location.href = `/api/analytics/export.csv?${query}`; };
  const k = data?.kpis;
  const projectName = f.projectId ? all.find((p) => String(p.id) === f.projectId)?.name : null;

  // Project × employee matrix, shaded by hours.
  const matrix = useMemo(() => {
    if (!data) return null;
    const ps = data.byProject.slice(0, 8), us = data.byEmployee.slice(0, 12);
    const cell = new Map(data.matrix.map((m) => [`${m.projectId}:${m.userId}`, m.minutes]));
    const max = Math.max(1, ...data.matrix.map((m) => m.minutes));
    return { ps, us, cell, max };
  }, [data]);
  const shade = (v: number, max: number) => {
    const steps = ["var(--seq-100)", "var(--seq-200)", "var(--seq-300)", "var(--seq-400)", "var(--seq-500)", "var(--seq-600)"];
    return steps[Math.min(steps.length - 1, Math.floor((v / max) * steps.length))];
  };

  return (
    <>
      <header className="page-head">
        <div><h1>Analytics</h1><p className="muted">{own ? "Your own time and work." : "Time and work across projects and employees. Click a bar to drill in."}</p></div>
        {perms!.export !== "none" && <button className="btn ink" onClick={exportCsv}><Icon name="download" /> Export CSV{perms!.export === "own" ? " (my time)" : ""}</button>}
      </header>

      <div className="filters">
        <select className="pill-select set" value={preset} onChange={(e) => { setPreset(e.target.value); if (PRESETS[e.target.value]) setRange(PRESETS[e.target.value]().map(isoDate) as [string, string]); }} aria-label="Period">
          {Object.keys(PRESETS).map((p) => <option key={p}>{p}</option>)}<option>Custom</option>
        </select>
        {preset === "Custom" && <>
          <input type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} aria-label="From" style={{ height: 32, minHeight: 32 }} />
          <input type="date" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} aria-label="To" style={{ height: 32, minHeight: 32 }} />
        </>}
        <select className={`pill-select ${f.clientId ? "set" : ""}`} value={f.clientId} onChange={(e) => set("clientId", e.target.value)} aria-label="Client"><option value="">All clients</option>{options?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={`pill-select ${f.projectId ? "set" : ""}`} value={f.projectId} onChange={(e) => set("projectId", e.target.value)} aria-label="Project"><option value="">All projects</option>{tops.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {subs.length > 0 && <select className={`pill-select ${f.subProjectId ? "set" : ""}`} value={f.subProjectId} onChange={(e) => set("subProjectId", e.target.value)} aria-label="Sub-project"><option value="">All sub-projects</option>{subs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        {!own && <>
          <select className={`pill-select ${f.teamId ? "set" : ""}`} value={f.teamId} onChange={(e) => set("teamId", e.target.value)} aria-label="Team"><option value="">All teams</option>{options?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select className={`pill-select ${f.userId ? "set" : ""}`} value={f.userId} onChange={(e) => set("userId", e.target.value)} aria-label="Employee"><option value="">All employees</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </>}
        <select className={`pill-select ${f.billable ? "set" : ""}`} value={f.billable} onChange={(e) => set("billable", e.target.value)} aria-label="Billable"><option value="">Billable and non-billable</option><option value="true">Billable only</option><option value="false">Non-billable only</option></select>
        {Object.values(f).some(Boolean) && <button className="btn sm ghost" onClick={() => setF({ clientId: "", projectId: "", subProjectId: "", teamId: "", userId: "", billable: "", q: "" })}><Icon name="x" /> Clear</button>}
      </div>

      {!data ? <p className="muted">Loading…</p> : (
        <div className={loading ? "loading-dim" : ""}>
          <div className="kpi-strip">
            <div className="kpi"><span>Tracked</span><strong>{fmtH(k!.totalMinutes, 1)}</strong><small>{k!.entries} entries</small></div>
            <div className="kpi"><span>Billable</span><strong>{fmtPct(k!.totalMinutes ? k!.billableMinutes / k!.totalMinutes : null)}</strong><small>{fmtH(k!.billableMinutes, 1)} billable</small></div>
            <div className="kpi"><span>Utilization</span><strong>{fmtPct(k!.utilization)}</strong><small>of weekday capacity</small></div>
            <div className="kpi"><span>{own ? "Projects" : "People"}</span><strong>{own ? k!.projects : k!.people}</strong><small>{own ? "worked on" : `across ${k!.projects} projects`}</small></div>
          </div>

          <section className="card">
            <div className="card-head"><h3 className="card-title">Hours {weekly ? "per week" : "per day"}</h3><small className="muted">{fmtDay(from, { day: "numeric", month: "short" })} – {fmtDay(to, { day: "numeric", month: "short", year: "numeric" })}</small></div>
            <div className="chart" style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={series.map((g) => ({ ...g, hours: g.minutes / 60 }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="key" tickFormatter={(v) => fmtDay(v, weekly ? { day: "numeric", month: "short" } : { day: "numeric" })} tick={{ fill: INK.axis, fontSize: 12 }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tick={{ fill: INK.axis, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
                  <Tooltip cursor={{ fill: "var(--hover)" }} content={<ChartTip fmtLabel={(l) => (weekly ? `Week of ${fmtDay(l)}` : fmtDay(l))} />} />
                  <Bar dataKey="hours" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid-2">
            <section className="card">
              <div className="card-head"><h3 className="card-title">{f.projectId ? `Sub-projects of ${projectName}` : "Hours by project"}</h3></div>
              <Rank head="Project" data={f.projectId ? data.bySubProject.map((g) => ({ ...g, color: all.find((p) => String(p.id) === f.projectId)?.color })) : data.byProject}
                onPick={f.subProjectId ? undefined : f.projectId ? (g) => set("subProjectId", String(g.key)) : (g) => set("projectId", String(g.key))}
                sub={(g) => `${fmtPct(g.minutes ? g.billableMinutes / g.minutes : 0)} billable · ${g.entries} entries${g.client ? ` · ${g.client}` : ""}`} />
            </section>
            {!own && (
              <section className="card">
                <div className="card-head"><h3 className="card-title">Hours by teammate</h3></div>
                <Rank head="Teammate" avatar data={data.byEmployee} onPick={f.userId ? undefined : (g) => set("userId", String(g.key))}
                  sub={(g) => `${fmtPct(g.utilization as number)} utilization · ${g.projects} project${g.projects === 1 ? "" : "s"}${g.team ? ` · ${g.team}` : ""}`} />
              </section>
            )}
            {own && (
              <section className="card">
                <div className="card-head"><h3 className="card-title">Top tasks</h3></div>
                <Rank head="Task" data={data.byTask} sub={(g) => String(g.project)} />
              </section>
            )}
          </div>

          {!own && matrix && matrix.ps.length > 0 && (
            <section className="card">
              <div className="card-head"><h3 className="card-title">Who worked on what</h3><small className="muted">Darker cells mean more hours</small></div>
              <div className="table-wrap">
                <table className="heat">
                  <thead><tr><th>Employee</th>{matrix.ps.map((p) => <th key={p.key} className="num"><span className="dot" style={{ background: p.color as string }} />{p.name}</th>)}<th className="num">Total</th></tr></thead>
                  <tbody>
                    {matrix.us.map((u) => (
                      <tr key={u.key}>
                        <td><button className="link" onClick={() => set("userId", String(u.key))}>{u.name}</button> <small className="muted">{u.team as string}</small></td>
                        {matrix.ps.map((p) => {
                          const v = matrix.cell.get(`${p.key}:${u.key}`) ?? 0;
                          return <td key={p.key} className="num" style={v ? { background: shade(v, matrix.max), color: v / matrix.max > 0.5 ? "#fff" : undefined } : undefined} title={`${u.name} · ${p.name}: ${fmtHours(v)}`}>{v ? fmtH(v, 0) : <span className="faint">–</span>}</td>;
                        })}
                        <td className="num strong">{fmtH(u.minutes, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!own && data.byTask.length > 0 && (
            <section className="card">
              <div className="card-head"><h3 className="card-title">Top tasks by hours</h3></div>
              <Rank head="Task" data={data.byTask} sub={(g) => String(g.project)} />
            </section>
          )}

          <section className="card">
            <div className="card-head" style={{ flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Work log <small className="muted">({data.kpis.entries} entries{data.truncated ? ", showing latest 500" : ""})</small></h2>
              <input type="search" placeholder="Search descriptions…" value={f.q} onChange={(e) => set("q", e.target.value)} aria-label="Search descriptions" />
            </div>
            <div className="table-wrap">
              <table className="simple log">
                <thead><tr><th>Date</th>{!own && <th>Employee</th>}<th>Project</th><th>Work description</th><th className="num">Hours</th></tr></thead>
                <tbody>
                  {data.entries.slice(0, shown).map((e) => (
                    <tr key={e.id}>
                      <td className="nowrap">{fmtDay(e.date)}<br /><small className="muted">{e.startTime ? `${e.startTime}–${e.endTime}` : ""}</small></td>
                      {!own && <td className="nowrap">{e.user.name}</td>}
                      <td><span className="dot" style={{ background: e.projectColor }} />{e.project}{e.subProject && <small className="muted"> › {e.subProject}</small>}{e.task && <><br /><small className="muted">{e.task}</small></>}</td>
                      <td>{e.description}{!e.billable && <span className="pill sm">Non-billable</span>}</td>
                      <td className="num strong">{fmtHours(e.minutes)}</td>
                    </tr>
                  ))}
                  {!data.entries.length && <tr><td colSpan={5} className="empty">No time entries match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            {data.entries.length > shown && <div className="row end"><button className="btn ghost" onClick={() => setShown(shown + 100)}>Show more ({data.entries.length - shown} more)</button></div>}
          </section>
        </div>
      )}
    </>
  );
}

// Ranked rows with inline bars (Fireflies teammate list pattern). Colour follows the project; people use one series colour.
function Rank({ head, data, onPick, sub, avatar }: { head: string; data: Group[]; onPick?: (g: Group) => void; sub?: (g: Group) => string; avatar?: boolean }) {
  if (!data.length) return <p className="empty">No data for these filters.</p>;
  const rows = data.slice(0, 12);
  const max = rows[0].minutes || 1;
  return (
    <>
      <div className="rank-head"><span>{head}</span><span /><span style={{ textAlign: "right" }}>Hours</span></div>
      <ul className="rank">
        {rows.map((g) => (
          <li key={g.key} className={onPick ? "click" : ""} onClick={onPick ? () => onPick(g) : undefined} title={onPick ? "Click to filter" : undefined}>
            <span className="name">{avatar ? <span className="avatar sm">{initials(String(g.name))}</span> : g.color ? <span className="dot" style={{ background: g.color as string, margin: 0 }} /> : null}<span>{g.name}</span></span>
            <div className="bar"><div style={{ width: `${(g.minutes / max) * 100}%`, background: (g.color as string) ?? SERIES }} /></div>
            <span className="val">{fmtH(g.minutes, 1)}</span>
            {sub && <span className="sub">{sub(g)}</span>}
          </li>
        ))}
      </ul>
      {data.length > rows.length && <p className="muted small" style={{ margin: "6px 6px 0" }}>+{data.length - rows.length} more</p>}
    </>
  );
}
