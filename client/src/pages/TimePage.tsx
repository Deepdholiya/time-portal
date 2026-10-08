import { useEffect, useState } from "react";
import { api, qs } from "../api";
import { useApp } from "../state";
import { addDays, fmtDay, fmtHours, isoDate, startOfWeek } from "../lib";
import type { TimeEntry } from "../types";
import { EntryForm } from "../components/EntryForm";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icons";

// Time entries grouped by day (Bonsai / ClickUp pattern), with manual entry and per-row actions.
export function TimePage() {
  const { me, perms, options, timeVersion, bumpTime, toast } = useApp();
  const [week, setWeek] = useState(startOfWeek(new Date()));
  const [userId, setUserId] = useState(me!.id);
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const from = isoDate(week), to = isoDate(addDays(week, 6));

  useEffect(() => {
    setEntries(null);
    api<TimeEntry[]>(`/time?${qs({ from, to, userId })}`).then(setEntries).catch((e) => toast(e.message, "error"));
  }, [from, userId, timeVersion]);

  async function remove(e: TimeEntry) {
    if (!confirm(`Delete ${fmtHours(e.minutes)} on ${e.project.name}?`)) return;
    try { await api(`/time/${e.id}`, { method: "DELETE" }); toast("Entry deleted"); bumpTime(); } catch (err) { toast((err as Error).message, "error"); }
  }
  async function duplicate(e: TimeEntry) {
    try {
      await api("/time", { body: { projectId: e.projectId, taskId: e.taskId, date: isoDate(new Date()), minutes: e.minutes, description: e.description, billable: e.billable, userId } });
      toast("Copied to today"); bumpTime();
    } catch (err) { toast((err as Error).message, "error"); }
  }

  const shown = (entries ?? []).filter((e) => !q || `${e.description} ${e.project.name} ${e.project.parent?.name ?? ""} ${e.task?.title ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const days = [...new Set(shown.map((e) => e.date))].sort().reverse();
  const total = shown.reduce((s, e) => s + e.minutes, 0);
  const who = options?.users.find((u) => u.id === userId)?.name;

  return (
    <>
      <header className="page-head">
        <div><h1>Time tracker</h1><p>Everything {userId === me!.id ? "you" : who} logged, grouped by day.</p></div>
        <div className="row">
          {perms!.editOthersTime === "yes" && (
            <select className="pill-select" value={userId} onChange={(e) => setUserId(Number(e.target.value))} aria-label="Employee">
              {options?.users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === me!.id ? " (me)" : ""}</option>)}
            </select>
          )}
          <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add time</button>
        </div>
      </header>

      <div className="row between wrap" style={{ marginBottom: 14 }}>
        <div className="week-nav" style={{ margin: 0 }}>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><Icon name="chevronLeft" /></button>
          <span className="range">{fmtDay(from, { day: "numeric", month: "short" })} – {fmtDay(to, { day: "numeric", month: "short", year: "numeric" })}</span>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><Icon name="chevronRight" /></button>
          <button className="btn sm" onClick={() => setWeek(startOfWeek(new Date()))}>This week</button>
        </div>
        <div className="row">
          <input type="search" placeholder="Search entries…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search entries" style={{ minWidth: 200 }} />
          <span className="nowrap">Week total <strong className="tnum">{fmtHours(total)}</strong></span>
        </div>
      </div>

      {!entries ? <p className="muted">Loading…</p> : !shown.length ? (
        <div className="card empty">
          <p>No time logged {q ? "matching your search" : "this week"}.</p>
          <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add time</button>
        </div>
      ) : (
        <>
          <div className="col-head"><span>Description</span><span>Project</span><span>Time</span><span /><span style={{ textAlign: "right" }}>Hours</span><span /></div>
          {days.map((d) => {
            const list = shown.filter((e) => e.date === d);
            const m = list.reduce((s, e) => s + e.minutes, 0);
            return (
              <section className="daygroup" key={d}>
                <div className="daygroup-head">
                  <span className="grow">{fmtDay(d, { weekday: "long", day: "numeric", month: "short" })}</span>
                  <div className={`daybar-mini ${m >= 480 ? "over" : ""}`} title={`${fmtHours(m)} of 8:00`}><div style={{ width: `${Math.min(100, (m / 480) * 100)}%` }} /></div>
                  <span className="tnum">{fmtHours(m)}</span>
                </div>
                {list.map((e) => (
                  <div className="entry-row" key={e.id}>
                    <div className="desc">{e.description}{e.task && <div className="muted small">{e.task.title}</div>}</div>
                    <div className="proj"><span className="dot" style={{ background: (e.project.parent ?? e.project).color }} /><span>{e.project.parent ? `${e.project.parent.name} › ` : ""}{e.project.name}</span></div>
                    <span className="muted small tnum nowrap">{e.startTime && e.endTime ? `${e.startTime} – ${e.endTime}` : "Duration"}</span>
                    <span>{e.billable ? <span className="pill info sm">Billable</span> : <span className="pill sm">Non-billable</span>}</span>
                    <strong className="num">{fmtHours(e.minutes)}</strong>
                    <div className="actions">
                      <button className="icon-btn" onClick={() => setEditing(e)} aria-label="Edit entry" title="Edit"><Icon name="edit" /></button>
                      <button className="icon-btn" onClick={() => duplicate(e)} aria-label="Copy to today" title="Copy to today"><Icon name="copy" /></button>
                      <button className="icon-btn" onClick={() => remove(e)} aria-label="Delete entry" title="Delete"><Icon name="trash" /></button>
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </>
      )}
      {adding && (
        <Modal title={userId === me!.id ? "Add time" : `Add time for ${who}`} onClose={() => setAdding(false)} wide>
          <EntryForm userId={userId} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit time entry" onClose={() => setEditing(null)} wide>
          <EntryForm entry={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
