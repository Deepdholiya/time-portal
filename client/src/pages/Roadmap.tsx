import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../state";
import { addDays, fmtDate, fmtH, HEALTH_LABEL, isoDate, parseISO, startOfWeek, STATUS_LABEL } from "../lib";
import { Icon } from "../components/Icons";

type Milestone = { id: number; name: string; dueDate: string; done: boolean };
type Item = {
  id: number; name: string; color: string; status: string; health: string; startDate: string | null; endDate: string | null;
  estimatedHours: number | null; trackedMinutes: number; totalMinutes?: number; progress: number | null; tasksDone: number; tasksTotal: number;
  client: { name: string } | null; manager: { name: string } | null; milestones: Milestone[]; children?: Item[]; clientId: number | null;
};

const ZOOMS = { weeks: { label: "Weeks" }, months: { label: "Months" }, quarters: { label: "Quarters" } } as const;
type Zoom = keyof typeof ZOOMS;
const HEALTH_ICON: Record<string, string> = { ON_TRACK: "●", AT_RISK: "▲", DELAYED: "■" };

export function Roadmap() {
  const { options } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);
  const [zoom, setZoom] = useState<Zoom>("quarters");
  const [anchor, setAnchor] = useState(() => defaultAnchor("quarters"));
  const [clientId, setClientId] = useState("");
  const [health, setHealth] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  useEffect(() => { api<Item[]>("/roadmap").then(setItems); }, []);

  // Columns per zoom (Jira timeline): weeks = 10 week columns, months = 6 months, quarters = 12 months grouped by quarter.
  const cols = useMemo(() => {
    if (zoom === "weeks") return Array.from({ length: 10 }, (_, i) => { const d = addDays(anchor, i * 7); return { start: d, end: addDays(d, 7), label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), sub: `W${isoWeek(d)}`, q: d.getDate() <= 7 }; });
    const n = zoom === "months" ? 6 : 12;
    return Array.from({ length: n }, (_, i) => { const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1); return { start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 1), label: d.toLocaleDateString(undefined, { month: "short" }), sub: d.getMonth() % 3 === 0 || i === 0 ? `Q${Math.floor(d.getMonth() / 3) + 1} ’${String(d.getFullYear()).slice(2)}` : "", q: d.getMonth() % 3 === 0 }; });
  }, [zoom, anchor]);
  const start = cols[0].start;
  const end = cols[cols.length - 1].end;
  const span = end.getTime() - start.getTime();
  const pos = (iso: string) => ((parseISO(iso).getTime() - start.getTime()) / span) * 100;
  const today = new Date();
  const todayPos = ((today.getTime() - start.getTime()) / span) * 100;
  const colW = (i: number) => ((cols[i].end.getTime() - cols[i].start.getTime()) / span) * 100;

  const filtered = useMemo(() => (items ?? []).filter((p) => (!clientId || String(p.clientId) === clientId) && (!health || p.health === health)), [items, clientId, health]);

  const bar = (it: Item, parentColor?: string) => {
    if (!it.startDate || !it.endDate) return <div className="rm-unscheduled">Not scheduled</div>;
    const l = Math.max(0, pos(it.startDate)), r = Math.min(100, pos(it.endDate.slice(0, 10)) + 0.2);
    if (r <= 0 || l >= 100) return null;
    const color = parentColor ?? it.color;
    const prog = it.progress ?? (it.estimatedHours ? Math.min(1, (it.totalMinutes ?? it.trackedMinutes) / 60 / it.estimatedHours) : 0);
    const tip = `${it.name}\n${fmtDate(it.startDate)} – ${fmtDate(it.endDate)}\n${it.tasksDone}/${it.tasksTotal} tasks done · ${fmtH(it.totalMinutes ?? it.trackedMinutes, 0)} tracked${it.estimatedHours ? ` of ${it.estimatedHours}h` : ""}\n${HEALTH_LABEL[it.health]} · ${STATUS_LABEL[it.status]}`;
    return (
      <div className={`rm-bar ${parentColor ? "sub" : ""}`} style={{ left: `${l}%`, width: `${r - l}%`, ["--c" as string]: color }} title={tip}>
        <div className="rm-fill" style={{ width: `${prog * 100}%` }} />
        <span className="rm-label">{it.name}{it.progress !== null ? ` · ${Math.round(it.progress * 100)}%` : ""}</span>
      </div>
    );
  };
  const diamonds = (ms: Milestone[]) => ms.map((m) => {
    const x = pos(m.dueDate.slice(0, 10));
    if (x < 0 || x > 100) return null;
    return <span key={m.id} className={`rm-ms ${m.done ? "done" : ""}`} style={{ left: `${x}%` }} title={`◆ ${m.name}\nDue ${fmtDate(m.dueDate)}${m.done ? " · reached" : ""}`} />;
  });

  const shift = (dir: number) => setAnchor(zoom === "weeks" ? addDays(anchor, dir * 28) : new Date(anchor.getFullYear(), anchor.getMonth() + dir * (zoom === "months" ? 2 : 3), 1));
  const changeZoom = (z: Zoom) => { setZoom(z); setAnchor(defaultAnchor(z)); };
  const upcoming = filtered.flatMap((p) => p.milestones.filter((m) => !m.done).map((m) => ({ ...m, project: p.name, color: p.color }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8);
  const todayIso = isoDate(today);

  return (
    <>
      <header className="page-head">
        <div><h1>Roadmap</h1><p className="muted">Projects, sub-projects and milestones over time. Filled part of each bar shows task progress.</p></div>
      </header>
      <div className="filters">
        <div className="row tight">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Earlier"><Icon name="chevronLeft" /></button>
          <strong className="nowrap">{start.toLocaleDateString(undefined, { month: "short", year: "numeric" })} – {new Date(end.getTime() - 864e5).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</strong>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Later"><Icon name="chevronRight" /></button>
        </div>
        <select className={`pill-select ${clientId ? "set" : ""}`} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client"><option value="">All clients</option>{options?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={`pill-select ${health ? "set" : ""}`} value={health} onChange={(e) => setHealth(e.target.value)} aria-label="Health"><option value="">Any health</option>{Object.entries(HEALTH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="check"><input type="checkbox" checked={expanded} onChange={(e) => setExpanded(e.target.checked)} /> Show sub-projects</label>
      </div>

      <div className="card roadmap">
        <div className="rm-scroll">
        <div className="rm-grid">
          <div className="rm-head rm-name">Work</div>
          <div className="rm-head rm-track">
            {cols.map((c, i) => <div key={c.start.toISOString()} className={`rm-month ${c.q ? "q" : ""}`} style={{ width: `${colW(i)}%` }}><span>{c.label}</span><small>{c.sub || "\u00a0"}</small></div>)}
            {todayPos >= 0 && todayPos <= 100 && <span className="rm-today-label" style={{ left: `${todayPos}%`, top: "auto", bottom: 2 }}>{today.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
          </div>
          {!items && <div className="muted">Loading…</div>}
          {filtered.map((p) => (
            <div className="rm-group" key={p.id}>
              <div className="rm-name">
                {p.children?.length ? <button className="icon-btn" onClick={() => setCollapsed((x) => { const n = new Set(x); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} aria-expanded={!collapsed.has(p.id)} aria-label={`Toggle ${p.name}`}><Icon name={collapsed.has(p.id) ? "chevronRight" : "chevronDown"} /></button> : <span style={{ width: 30 }} />}
                <span className="dot" style={{ background: p.color, margin: 0 }} />
                <div className="grow"><strong>{p.name}</strong><small className="muted">{p.client?.name ?? ""}{p.manager ? ` · ${p.manager.name}` : ""}</small></div>
                <span className={`health-tag h-${p.health}`} title={HEALTH_LABEL[p.health]}><span aria-hidden>{HEALTH_ICON[p.health]}</span> {HEALTH_LABEL[p.health]}</span>
              </div>
              <div className="rm-track">
                {cols.map((c, i) => <div key={c.start.toISOString()} className="rm-col" style={{ width: `${colW(i)}%` }} />)}
                {bar(p)}
                {diamonds(p.milestones)}
                {todayPos >= 0 && todayPos <= 100 && <div className="rm-today" style={{ left: `${todayPos}%` }} />}
              </div>
              {expanded && !collapsed.has(p.id) && p.children?.map((c) => (
                <div className="rm-sub" key={c.id}>
                  <div className="rm-name sub"><span className="grow">{c.name}</span><small className="muted">{c.tasksDone}/{c.tasksTotal}</small></div>
                  <div className="rm-track">
                    {cols.map((c, i) => <div key={c.start.toISOString()} className="rm-col" style={{ width: `${colW(i)}%` }} />)}
                    {bar(c, p.color)}
                    {diamonds(c.milestones)}
                    {todayPos >= 0 && todayPos <= 100 && <div className="rm-today" style={{ left: `${todayPos}%` }} />}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        </div>
        <div className="rm-zoom" role="group" aria-label="Zoom">
          <button onClick={() => setAnchor(defaultAnchor(zoom))}>Today</button>
          <span className="sep" />
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => <button key={z} className={zoom === z ? "on" : ""} aria-pressed={zoom === z} onClick={() => changeZoom(z)}>{ZOOMS[z].label}</button>)}
        </div>
        <div className="legend">
          <span><span className="rm-ms legend-ms" /> Milestone</span>
          <span><span className="rm-ms legend-ms done" /> Reached</span>
          <span><span className="legend-today" /> Today</span>
          {Object.entries(HEALTH_LABEL).map(([k, v]) => <span key={k} className={`health-tag h-${k}`}><span aria-hidden>{HEALTH_ICON[k]}</span> {v}</span>)}
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3 className="card-title">Upcoming milestones</h3></div>
          <ul className="mini-list">
            {upcoming.map((m) => (
              <li key={m.id}>
                <span className="dot" style={{ background: m.color }} />
                <span className="grow">{m.name} <small className="muted">· {m.project}</small></span>
                <span className={`pill ${m.dueDate.slice(0, 10) < todayIso ? "warn" : ""}`}>{m.dueDate.slice(0, 10) < todayIso ? "Overdue " : ""}{fmtDate(m.dueDate)}</span>
              </li>
            ))}
            {!upcoming.length && <li className="muted">No open milestones</li>}
          </ul>
        </section>
        <section className="card">
          <div className="card-head"><h3 className="card-title">Portfolio summary</h3></div>
          <table>
            <thead><tr><th>Project</th><th>Health</th><th className="num">Tasks</th><th className="num">Hours</th></tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><span className="dot" style={{ background: p.color }} />{p.name}</td>
                  <td><span className={`health-tag h-${p.health}`}><span aria-hidden>{HEALTH_ICON[p.health]}</span> {HEALTH_LABEL[p.health]}</span></td>
                  <td className="num">{p.tasksDone}/{p.tasksTotal}</td>
                  <td className="num">{fmtH(p.totalMinutes ?? 0, 0)}{p.estimatedHours ? <span className="muted"> / {p.estimatedHours}h</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

// Opening window for each zoom, with today near the left third.
function defaultAnchor(z: "weeks" | "months" | "quarters") {
  const d = new Date();
  if (z === "weeks") return addDays(startOfWeek(d), -14);
  if (z === "months") return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 - 3, 1);
}
