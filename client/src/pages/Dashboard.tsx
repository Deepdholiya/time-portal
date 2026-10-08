import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import { useApp } from "../state";
import { addDays, fmtDate, fmtDay, fmtH, fmtHours, isoDate, startOfWeek, TASK_LABEL } from "../lib";
import type { TimeEntry } from "../types";
import { Icon } from "../components/Icons";

type ProjectNode = { id: number; name: string; color: string; tasks: { id: number; title: string; status: string; dueDate: string | null; assignee: { id: number } | null }[]; children: ProjectNode[] };

export function Dashboard() {
  const { me, timeVersion } = useApp();
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [tasks, setTasks] = useState<{ id: number; title: string; status: string; dueDate: string | null; project: string; color: string }[]>([]);
  const today = isoDate(new Date());
  const weekStart = startOfWeek(new Date());

  useEffect(() => {
    api<TimeEntry[]>(`/time?${qs({ from: isoDate(addDays(weekStart, -7)), to: isoDate(addDays(weekStart, 6)) })}`).then(setEntries);
  }, [timeVersion]);
  useEffect(() => {
    api<ProjectNode[]>("/projects").then((ps) => {
      const mine: typeof tasks = [];
      const walk = (p: ProjectNode, parent?: ProjectNode) => {
        for (const t of p.tasks) if (t.assignee?.id === me!.id && t.status !== "DONE") mine.push({ ...t, project: parent ? `${parent.name} › ${p.name}` : p.name, color: (parent ?? p).color });
        p.children?.forEach((c) => walk(c, p));
      };
      ps.forEach((p) => walk(p));
      setTasks(mine.sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")));
    });
  }, []);

  const [lastPeriod, setLastPeriod] = useState<{ status: string; note: string | null } | null | undefined>(undefined);
  useEffect(() => { api<{ status: string; note: string | null } | null>(`/timesheets?${qs({ weekStart: isoDate(addDays(weekStart, -7)) })}`).then(setLastPeriod); }, [timeVersion]);

  if (!entries) return <div className="muted">Loading…</div>;
  const thisWeek = entries.filter((e) => e.date >= isoDate(weekStart));
  const lastWeek = entries.filter((e) => e.date < isoDate(weekStart));
  const sum = (xs: TimeEntry[]) => xs.reduce((s, e) => s + e.minutes, 0);
  const todayMin = sum(entries.filter((e) => e.date === today));
  const weekMin = sum(thisWeek);
  const billMin = sum(thisWeek.filter((e) => e.billable));
  const mix = new Map<string, { name: string; color: string; minutes: number }>();
  for (const e of thisWeek) {
    const top = e.project.parent ?? e.project;
    const g = mix.get(top.name) ?? { name: top.name, color: top.color, minutes: 0 };
    g.minutes += e.minutes; mix.set(top.name, g);
  }
  const mixList = [...mix.values()].sort((a, b) => b.minutes - a.minutes);
  const days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i)));
  const maxDay = Math.max(8 * 60, ...days.map((d) => sum(thisWeek.filter((e) => e.date === d))));

  return (
    <>
      <header className="page-head">
        <div><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {me!.name.split(" ")[0]}</h1><p className="muted">{fmtDate(today)}</p></div>
        <div className="row"><Link to="/timesheet" className="btn">Open timesheet</Link><Link to="/time" className="btn primary"><Icon name="plus" /> Add time</Link></div>
      </header>
      {lastPeriod === null && <div className="banner info"><Icon name="send" /><span className="grow">Last week's timesheet hasn't been submitted yet.</span><Link to="/timesheet" className="btn sm" onClick={() => sessionStorage.setItem("ts-week", "prev")}>Review and submit</Link></div>}
      {lastPeriod?.status === "REJECTED" && <div className="banner bad"><Icon name="x" /><span className="grow"><strong>Last week was sent back:</strong> {lastPeriod.note}</span><Link to="/timesheet" className="btn sm" onClick={() => sessionStorage.setItem("ts-week", "prev")}>Fix it</Link></div>}
      <div className="kpi-strip">
        <div className="kpi"><span>Today</span><strong>{fmtHours(todayMin)}</strong><small>of 8:00 expected</small></div>
        <div className="kpi"><span>This week</span><strong>{fmtHours(weekMin)}</strong><small>last week {fmtHours(sum(lastWeek))}</small></div>
        <div className="kpi"><span>Billable this week</span><strong>{weekMin ? Math.round((billMin / weekMin) * 100) : 0}%</strong><small>{fmtH(billMin)} billable</small></div>
        <div className="kpi"><span>Open tasks</span><strong>{tasks.length}</strong><small>{tasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today).length} overdue</small></div>
      </div>
      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3 className="card-title">This week by day</h3></div>
          <div className="daybars" role="list">
            {days.map((d) => {
              const m = sum(thisWeek.filter((e) => e.date === d));
              return (
                <div key={d} className="daybar" role="listitem" title={`${fmtDay(d)}: ${fmtHours(m)}`}>
                  <div className="daybar-track"><div className="daybar-target" style={{ bottom: `${(480 / maxDay) * 100}%` }} /><div className="daybar-fill" style={{ height: `${(m / maxDay) * 100}%` }} /></div>
                  <small className={d === today ? "strong" : "muted"}>{fmtDay(d, { weekday: "short" })}</small>
                  <small>{m ? fmtHours(m) : ""}</small>
                </div>
              );
            })}
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3 className="card-title">Project mix this week</h3></div>
          {mixList.length ? (
            <ul className="barlist">
              {mixList.map((p) => (
                <li key={p.name}>
                  <div className="barlist-label"><span className="dot" style={{ background: p.color }} />{p.name}<span className="grow" /><strong>{fmtHours(p.minutes)}</strong></div>
                  <div className="barlist-track"><div style={{ width: `${(p.minutes / mixList[0].minutes) * 100}%`, background: p.color }} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="empty">No time logged this week yet.</p>}
        </section>
        <section className="card">
          <div className="card-head"><h3 className="card-title">Recent entries</h3><Link to="/time" className="link small">View all</Link></div>
          <ul className="entry-list compact">
            {entries.slice(0, 6).map((e) => (
              <li key={e.id}>
                <span className="dot" style={{ background: (e.project.parent ?? e.project).color }} />
                <div className="grow"><div>{e.description}</div><small className="muted">{e.project.parent ? `${e.project.parent.name} › ` : ""}{e.project.name} · {fmtDay(e.date)}</small></div>
                <strong>{fmtHours(e.minutes)}</strong>
              </li>
            ))}
            {!entries.length && <p className="empty">Nothing logged yet.</p>}
          </ul>
        </section>
        <section className="card">
          <div className="card-head"><h3 className="card-title">My open tasks</h3></div>
          <ul className="entry-list compact">
            {tasks.slice(0, 8).map((t) => (
              <li key={t.id}>
                <span className="dot" style={{ background: t.color }} />
                <div className="grow"><div>{t.title}</div><small className="muted">{t.project}</small></div>
                <span className={`pill ${t.dueDate && t.dueDate.slice(0, 10) < today ? "warn" : ""}`}>{t.dueDate ? `Due ${fmtDate(t.dueDate)}` : TASK_LABEL[t.status]}</span>
              </li>
            ))}
            {!tasks.length && <p className="empty">No open tasks assigned to you.</p>}
          </ul>
        </section>
      </div>
    </>
  );
}
