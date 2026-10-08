import { useEffect, useMemo, useState } from "react";
import { api, qs } from "../api";
import { useApp } from "../state";
import { addDays, fmtDay, fmtHours, isoDate, parseDuration, startOfWeek } from "../lib";
import type { TimeEntry } from "../types";
import { Icon } from "../components/Icons";
import { ProjectMenu } from "../components/ProjectMenu";
import type { Pick } from "../components/ProjectPicker";
import { Modal } from "../components/Modal";

type Period = { id: number; status: "SUBMITTED" | "APPROVED" | "REJECTED"; note: string | null; submittedAt: string; reviewedAt: string | null; reviewedBy: { name: string } | null } | null;
type Row = { key: string; projectId: number; taskId: number | null; label: string; sub: string; color: string; description: string };

const rowKey = (projectId: number, taskId: number | null) => `${projectId}:${taskId ?? ""}`;

// Weekly grid with editable hour cells (Toggl Track timesheet), plus submit-for-approval.
export function Timesheet() {
  const { me, perms, options, timeVersion, bumpTime, toast } = useApp();
  const [week, setWeek] = useState(() => {
    let prev = false;
    try { prev = sessionStorage.getItem("ts-week") === "prev"; sessionStorage.removeItem("ts-week"); } catch { /* storage unavailable */ }
    return addDays(startOfWeek(new Date()), prev ? -7 : 0);
  });
  const [userId, setUserId] = useState(me!.id);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [period, setPeriod] = useState<Period>(null);
  const [extraRows, setExtraRows] = useState<Row[]>([]);
  const [descs, setDescs] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [addingRow, setAddingRow] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(week, i)));
  const today = isoDate(new Date());
  const mine = userId === me!.id;

  const load = () => Promise.all([
    api<TimeEntry[]>(`/time?${qs({ from: days[0], to: days[6], userId })}`).then(setEntries),
    api<Period>(`/timesheets?${qs({ weekStart: days[0], userId })}`).then(setPeriod),
  ]);
  useEffect(() => { load(); setDrafts({}); }, [days[0], userId, timeVersion]);
  useEffect(() => { setExtraRows([]); setDescs({}); }, [days[0], userId]);

  const projById = new Map((options?.projects ?? []).map((p) => [p.id, p]));
  const allById = new Map((options?.allProjects ?? []).map((p) => [p.id, p]));
  const describe = (projectId: number, taskId: number | null): Omit<Row, "key" | "projectId" | "taskId" | "description"> => {
    const p = projById.get(projectId) ?? allById.get(projectId);
    const parent = p?.parentId ? allById.get(p.parentId) : undefined;
    const task = taskId ? projById.get(projectId)?.tasks.find((t) => t.id === taskId)?.title ?? entries.find((e) => e.taskId === taskId)?.task?.title : undefined;
    return { label: parent ? `${parent.name} › ${p?.name}` : p?.name ?? "Project", sub: task ?? "", color: (parent ?? p)?.color ?? "#898781" };
  };

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const e of [...entries].sort((a, b) => b.date.localeCompare(a.date))) {
      const k = rowKey(e.projectId, e.taskId);
      if (!map.has(k)) map.set(k, { key: k, projectId: e.projectId, taskId: e.taskId, description: e.description, ...describe(e.projectId, e.taskId) });
    }
    for (const r of extraRows) if (!map.has(r.key)) map.set(r.key, r);
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label) || a.sub.localeCompare(b.sub));
  }, [entries, extraRows, options]);

  const cellEntries = (r: Row, d: string) => entries.filter((e) => e.projectId === r.projectId && e.taskId === r.taskId && e.date === d);
  const cellMin = (r: Row, d: string) => cellEntries(r, d).reduce((s, e) => s + e.minutes, 0);
  const locked = !!period && period.status !== "REJECTED";

  async function commit(r: Row, d: string) {
    const k = `${r.key}|${d}`;
    const raw = drafts[k];
    if (raw === undefined) return;
    const clear = () => setDrafts((x) => { const n = { ...x }; delete n[k]; return n; });
    const current = cellMin(r, d);
    const next = raw.trim() === "" ? 0 : parseDuration(raw);
    if (next === null) { toast("Enter hours like 1:30 or 1.5", "error"); return clear(); }
    if (next === current) return clear();
    const list = cellEntries(r, d);
    try {
      if (next > current) {
        const description = (descs[r.key] ?? r.description).trim();
        if (!description) { toast("Add a description for this row first", "error"); return clear(); }
        await api("/time", { body: { projectId: r.projectId, taskId: r.taskId, date: d, minutes: next - current, description, billable: true, userId } });
      } else if (next === 0) {
        if (!confirm(`Delete ${list.length} entr${list.length === 1 ? "y" : "ies"} (${fmtHours(current)}) on ${fmtDay(d)}?`)) return clear();
        for (const e of list) await api(`/time/${e.id}`, { method: "DELETE" });
      } else if (list.length === 1) {
        const e = list[0];
        await api(`/time/${e.id}`, { method: "PUT", body: { projectId: e.projectId, taskId: e.taskId, date: e.date, minutes: next, startTime: null, endTime: null, description: e.description, billable: e.billable } });
      } else {
        toast(`This cell has ${list.length} entries. Reduce them on the Time tracker page.`, "error");
        return clear();
      }
      bumpTime();
    } catch (e) { toast((e as Error).message, "error"); clear(); }
  }

  async function copyLastWeek() {
    const prev = await api<TimeEntry[]>(`/time?${qs({ from: isoDate(addDays(week, -7)), to: isoDate(addDays(week, -1)), userId })}`);
    const add: Row[] = [];
    for (const e of prev) {
      const k = rowKey(e.projectId, e.taskId);
      if (!rows.some((r) => r.key === k) && !add.some((r) => r.key === k)) add.push({ key: k, projectId: e.projectId, taskId: e.taskId, description: e.description, ...describe(e.projectId, e.taskId) });
    }
    setExtraRows((x) => [...x, ...add]);
    toast(add.length ? `Added ${add.length} row${add.length === 1 ? "" : "s"} from last week` : "Last week has no rows that aren't here already");
  }

  async function act(path: string, msg: string) {
    setBusy(true);
    try { await api(path, { body: { weekStart: days[0] } }); toast(msg); await load(); bumpTime(); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }

  const dayTotal = (d: string) => entries.filter((e) => e.date === d).reduce((s, e) => s + e.minutes, 0);
  const total = entries.reduce((s, e) => s + e.minutes, 0);

  return (
    <>
      <header className="page-head">
        <div><h1>Timesheet</h1><p>Type hours straight into the grid, then submit the week for approval.</p></div>
        <div className="row">
          {(perms!.editOthersTime === "yes") && (
            <select className="pill-select" value={userId} onChange={(e) => setUserId(Number(e.target.value))} aria-label="Employee">
              {options?.users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === me!.id ? " (me)" : ""}</option>)}
            </select>
          )}
          {mine && (!period || period.status === "REJECTED") && <button className="btn ink" disabled={busy || !total} onClick={() => act("/timesheets/submit", "Week submitted for approval")}><Icon name="send" /> Submit week</button>}
        </div>
      </header>

      <div className="row between wrap" style={{ marginBottom: 14 }}>
        <div className="week-nav" style={{ margin: 0 }}>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><Icon name="chevronLeft" /></button>
          <span className="range">{fmtDay(days[0], { day: "numeric", month: "short" })} – {fmtDay(days[6], { day: "numeric", month: "short", year: "numeric" })}</span>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><Icon name="chevronRight" /></button>
          <button className="btn sm" onClick={() => setWeek(startOfWeek(new Date()))}>This week</button>
        </div>
        <span>Week total <strong className="tnum">{fmtHours(total)}</strong></span>
      </div>

      {period?.status === "SUBMITTED" && (
        <div className="banner info"><Icon name="send" /><span className="grow">Submitted {new Date(period.submittedAt).toLocaleDateString()} and waiting for approval. The week is locked until it's reviewed.</span>
          {mine && <button className="btn sm" disabled={busy} onClick={() => act("/timesheets/withdraw", "Submission withdrawn")}>Withdraw</button>}</div>
      )}
      {period?.status === "APPROVED" && <div className="banner good"><Icon name="check" /><span className="grow">Approved by {period.reviewedBy?.name ?? "a manager"} on {new Date(period.reviewedAt!).toLocaleDateString()}. This week is locked.</span></div>}
      {period?.status === "REJECTED" && <div className="banner bad"><Icon name="x" /><span className="grow"><strong>Sent back by {period.reviewedBy?.name}:</strong> {period.note}</span><span className="small">Fix it and submit again</span></div>}

      <div className="card flush table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Project / task</th>
              <th style={{ textAlign: "left" }}>Description for new time</th>
              {days.map((d) => <th key={d} className={d === today ? "today" : ""}>{fmtDay(d, { weekday: "short" })}<small>{fmtDay(d, { day: "numeric", month: "short" })}</small></th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="hoverable">
                <td><div className="proj-cell"><strong><span className="dot" style={{ background: r.color }} />{r.label}</strong>{r.sub && <small className="muted" style={{ paddingLeft: 17 }}>{r.sub}</small>}</div></td>
                <td><input className="row-desc" disabled={locked} value={descs[r.key] ?? r.description} onChange={(e) => setDescs({ ...descs, [r.key]: e.target.value })} placeholder="What did you work on?" aria-label={`Description for ${r.label}`} /></td>
                {days.map((d) => {
                  const k = `${r.key}|${d}`;
                  const m = cellMin(r, d);
                  return (
                    <td key={d}>
                      <input className={`cell-input ${m ? "filled" : ""}`} disabled={locked} value={drafts[k] ?? (m ? fmtHours(m) : "")} placeholder="–"
                        onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })} onBlur={() => commit(r, d)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        aria-label={`${r.label} ${fmtDay(d)}`} />
                    </td>
                  );
                })}
                <td className="num strong">{fmtHours(days.reduce((s, d) => s + cellMin(r, d), 0))}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="empty">No rows yet. Add a row or copy last week's rows.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                {!locked && <div className="row tight">
                  <button className="btn sm" onClick={() => setAddingRow(true)}><Icon name="plus" /> Add row</button>
                  <button className="btn sm ghost" onClick={copyLastWeek}><Icon name="copy" /> Copy last week</button>
                </div>}
              </td>
              {days.map((d) => <td key={d} className="tnum">{dayTotal(d) ? fmtHours(dayTotal(d)) : "–"}</td>)}
              <td className="num">{fmtHours(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">Typing a bigger number adds a new entry with the row's description. Typing a smaller number edits the cell's entry, and clearing a cell deletes its entries.</p>
      {addingRow && <AddRow onClose={() => setAddingRow(false)} onAdd={(p, description) => {
        const k = rowKey(p.projectId!, p.taskId);
        setExtraRows((x) => [...x, { key: k, projectId: p.projectId!, taskId: p.taskId, description, ...describe(p.projectId!, p.taskId) }]);
        setAddingRow(false);
      }} />}
    </>
  );
}

function AddRow({ onClose, onAdd }: { onClose: () => void; onAdd: (p: Pick, description: string) => void }) {
  const [pick, setPick] = useState<Pick>({ projectId: null, taskId: null });
  const [description, setDescription] = useState("");
  return (
    <Modal title="Add a row" onClose={onClose}>
      <div className="stack">
        <div className="field"><span>Project, sub-project or task</span><div style={{ border: "1px solid var(--border)", borderRadius: 7, padding: 2 }}><ProjectMenu value={pick} onChange={setPick} /></div></div>
        <label className="field"><span>Description</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will you work on?" /></label>
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!pick.projectId} onClick={() => onAdd(pick, description)}>Add row</button></div>
      </div>
    </Modal>
  );
}
