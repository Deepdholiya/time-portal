import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useApp } from "../state";
import { fmtHours, isoDate, parseDuration } from "../lib";
import type { TimeEntry } from "../types";
import { ProjectPicker, type Pick } from "./ProjectPicker";

// Manual time entry: either a start/end range or a plain duration.
export function EntryForm({ entry, userId, defaultDate, defaultProjectId, onSaved, onCancel }: { entry?: TimeEntry; userId?: number; defaultDate?: string; defaultProjectId?: number; onSaved: (e: TimeEntry) => void; onCancel?: () => void }) {
  const { toast, bumpTime } = useApp();
  const [pick, setPick] = useState<Pick>({ projectId: entry?.projectId ?? defaultProjectId ?? null, taskId: entry?.taskId ?? null });
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? isoDate(new Date()));
  const [mode, setMode] = useState<"range" | "duration">(entry && !entry.startTime ? "duration" : "range");
  const [start, setStart] = useState(entry?.startTime ?? "09:00");
  const [end, setEnd] = useState(entry?.endTime ?? "10:00");
  const [duration, setDuration] = useState(entry ? fmtHours(entry.minutes) : "1:00");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [billable, setBillable] = useState(entry?.billable ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rangeMinutes = (() => {
    const [sh, sm] = start.split(":").map(Number), [eh, em] = end.split(":").map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  })();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!pick.projectId) return setError("Pick a project");
    const minutes = mode === "duration" ? parseDuration(duration) : null;
    if (mode === "duration" && !minutes) return setError("Enter a duration like 1:30 or 1.5");
    const body = {
      projectId: pick.projectId, taskId: pick.taskId, date, description, billable, userId,
      ...(mode === "range" ? { startTime: start, endTime: end } : { minutes }),
    };
    setSaving(true);
    try {
      const saved = await api<TimeEntry>(entry ? `/time/${entry.id}` : "/time", { method: entry ? "PUT" : "POST", body });
      toast(entry ? "Entry updated" : `Logged ${fmtHours(saved.minutes)} on ${saved.project.name}`);
      bumpTime();
      onSaved(saved);
      if (!entry) setDescription("");
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <ProjectPicker value={pick} onChange={setPick} />
      <label className="field full">
        <span>What did you work on?</span>
        <textarea required rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Built the checkout page and fixed Safari layout bugs" />
      </label>
      <div className="row wrap">
        <label className="field"><span>Date</span><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="field">
          <span>Time</span>
          <div className="segmented" role="group" aria-label="Entry type">
            <button type="button" className={mode === "range" ? "on" : ""} onClick={() => setMode("range")}>Start – end</button>
            <button type="button" className={mode === "duration" ? "on" : ""} onClick={() => setMode("duration")}>Duration</button>
          </div>
        </div>
        {mode === "range" ? (
          <>
            <label className="field"><span>Start</span><input type="time" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field"><span>End</span><input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <div className="field"><span>Total</span><div className="total">{rangeMinutes > 0 ? fmtHours(rangeMinutes) : "—"}</div></div>
          </>
        ) : (
          <label className="field"><span>Hours</span><input required value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="1:30" style={{ width: 90 }} /></label>
        )}
        <label className="check"><input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> Billable</label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" disabled={saving}>{saving ? "Saving…" : entry ? "Save changes" : "Add time entry"}</button>
      </div>
    </form>
  );
}
