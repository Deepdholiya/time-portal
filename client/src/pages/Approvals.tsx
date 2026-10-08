import { useEffect, useState } from "react";
import { api, qs } from "../api";
import { useApp } from "../state";
import { addDays, fmtDay, fmtH, fmtHours, isoDate, parseISO } from "../lib";
import type { TimeEntry } from "../types";
import { Icon } from "../components/Icons";
import { Modal } from "../components/Modal";
import { initials } from "../App";

type Item = {
  id: number; weekStart: string; status: string; note: string | null; submittedAt: string; reviewedAt: string | null; reviewedBy: { name: string } | null;
  user: { id: number; name: string; team: { name: string } | null; weeklyCapacity: number };
  minutes: number; billableMinutes: number; projects: { name: string; color: string; minutes: number }[]; byDay: Record<string, number>;
};
const TABS = [["SUBMITTED", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Sent back"]] as const;

export function Approvals() {
  const { perms, toast, bumpTime } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("SUBMITTED");
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Item | null>(null);
  const load = () => api<Item[]>(`/timesheets/approvals?status=${tab}`).then(setItems);
  useEffect(() => { setItems(null); load(); }, [tab]);

  async function approve(i: Item) {
    try { await api(`/timesheets/${i.id}/approve`, { method: "POST" }); toast(`Approved ${i.user.name}'s week`); load(); bumpTime(); } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <>
      <header className="page-head"><div><h1>Approvals</h1><p>Review submitted timesheets. Approved weeks are locked, and weeks you send back can be edited again.</p></div></header>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}{tab === k && items && <span className="count">{items.length}</span>}</button>)}
      </div>
      {!items ? <p className="muted">Loading…</p> : !items.length ? <div className="card empty">{tab === "SUBMITTED" ? "You're all caught up. No timesheets are waiting." : "Nothing here yet."}</div> : (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Week</th><th className="num">Hours</th><th>Project mix</th><th>{tab === "SUBMITTED" ? "Submitted" : "Reviewed"}</th><th /></tr></thead>
            <tbody>
              {items.map((i) => {
                const cap = i.user.weeklyCapacity * 60;
                return [
                  <tr key={i.id} className="hoverable">
                    <td><div className="row"><span className="avatar sm">{initials(i.user.name)}</span><div><strong>{i.user.name}</strong><div className="muted small">{i.user.team?.name ?? ""}</div></div></div></td>
                    <td className="nowrap">{fmtDay(i.weekStart, { day: "numeric", month: "short" })} – {fmtDay(isoDate(addDays(parseISO(i.weekStart), 6)), { day: "numeric", month: "short" })}</td>
                    <td className="num"><strong>{fmtHours(i.minutes)}</strong><div className={`small ${i.minutes < cap * 0.9 ? "text-critical" : "muted"}`}>of {i.user.weeklyCapacity}h</div></td>
                    <td>
                      <div className="stack-bar" title={i.projects.map((p) => `${p.name}: ${fmtH(p.minutes)}`).join("\n")}>
                        {i.projects.map((p) => <div key={p.name} style={{ width: `${(p.minutes / i.minutes) * 100}%`, background: p.color }} />)}
                      </div>
                      <div className="muted small" style={{ marginTop: 4 }}>{i.projects.slice(0, 3).map((p) => `${p.name} ${fmtH(p.minutes, 0)}`).join(" · ")}</div>
                    </td>
                    <td className="small nowrap">{tab === "SUBMITTED" ? new Date(i.submittedAt).toLocaleDateString() : <>{i.reviewedBy?.name}<div className="muted">{i.reviewedAt && new Date(i.reviewedAt).toLocaleDateString()}</div></>}</td>
                    <td className="nowrap" style={{ textAlign: "right" }}>
                      {perms!.editOthersTime === "yes" && <button className="btn sm ghost" onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? "Hide" : "Entries"}</button>}
                      {tab !== "REJECTED" && <button className="btn sm" onClick={() => setRejecting(i)}>Send back</button>}
                      {tab === "SUBMITTED" && <button className="btn sm good" onClick={() => approve(i)}><Icon name="check" /> Approve</button>}
                    </td>
                  </tr>,
                  tab === "REJECTED" && i.note ? <tr key={`n${i.id}`}><td colSpan={6} className="small muted" style={{ paddingTop: 0 }}>Note: {i.note}</td></tr> : null,
                  open === i.id ? <tr key={`e${i.id}`}><td colSpan={6} style={{ background: "var(--surface-2)" }}><WeekEntries userId={i.user.id} weekStart={i.weekStart} /></td></tr> : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {rejecting && <RejectModal item={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); load(); }} />}
    </>
  );
}

function WeekEntries({ userId, weekStart }: { userId: number; weekStart: string }) {
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  useEffect(() => { api<TimeEntry[]>(`/time?${qs({ from: weekStart, to: isoDate(addDays(parseISO(weekStart), 6)), userId })}`).then(setEntries); }, []);
  if (!entries) return <span className="muted">Loading…</span>;
  return (
    <table>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td className="nowrap small">{fmtDay(e.date)}</td>
            <td className="small"><span className="dot" style={{ background: (e.project.parent ?? e.project).color }} />{e.project.parent ? `${e.project.parent.name} › ` : ""}{e.project.name}{e.task ? ` · ${e.task.title}` : ""}</td>
            <td className="small">{e.description}</td>
            <td className="num small strong">{fmtHours(e.minutes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RejectModal({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [note, setNote] = useState("");
  async function send() {
    try { await api(`/timesheets/${item.id}/reject`, { body: { note } }); toast(`Sent back to ${item.user.name}`); onDone(); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <Modal title={`Send back ${item.user.name}'s week`} onClose={onClose}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>The week unlocks so they can fix it and submit again. They'll see your note on their timesheet.</p>
        <label className="field"><span>What needs fixing?</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></label>
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn danger" disabled={!note.trim()} onClick={send}>Send back</button></div>
      </div>
    </Modal>
  );
}
