import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../state";
import { isoDate, nowHHMM, pad } from "../lib";
import type { TimeEntry } from "../types";
import { Icon } from "./Icons";
import { ProjectMenu } from "./ProjectMenu";
import type { Pick } from "./ProjectPicker";

const elapsed = (since: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

// Persistent global timer (Toggl Track pattern): description, project, billable, clock, play/stop.
export function TimerBar() {
  const { timer, setTimer, toast, bumpTime } = useApp();
  const [pick, setPick] = useState<Pick>({ projectId: null, taskId: null });
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer]);
  useEffect(() => {
    if (timer) { setDescription(timer.description); setPick({ projectId: timer.projectId, taskId: timer.taskId }); setBillable(timer.billable); }
  }, [timer?.id]);

  async function start() {
    if (!pick.projectId) return toast("Pick a project to start the timer", "error");
    setBusy(true);
    try { setTimer(await api<TimeEntry>("/time/timer/start", { body: { ...pick, description, billable, date: isoDate(new Date()), startTime: nowHHMM() } })); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function stop() {
    if (!description.trim()) return toast("Add a short description of the work before stopping", "error");
    setBusy(true);
    try {
      await api("/time/timer/stop", { body: { endTime: nowHHMM(), description } });
      setTimer(null); setDescription(""); setPick({ projectId: null, taskId: null }); bumpTime();
      toast("Time entry saved");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function discard() {
    if (!confirm("Discard the running timer? No time will be saved.")) return;
    await api("/time/timer/discard", { method: "DELETE" });
    setTimer(null); setDescription("");
  }

  return (
    <div className={`timerbar ${timer ? "running" : ""}`}>
      <input className="timer-input" value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !timer && start()}
        placeholder="What are you working on?" aria-label="What are you working on?" />
      {timer ? (
        <span className="tool-btn on" title="Project"><span className="dot" style={{ background: timer.project.parent?.color ?? timer.project.color, margin: 0 }} />
          <span className="label">{[timer.project.parent?.name, timer.project.name, timer.task?.title].filter(Boolean).join(" › ")}</span></span>
      ) : <ProjectMenu value={pick} onChange={setPick} />}
      <button type="button" className={`tool-btn ${billable ? "on" : ""}`} onClick={() => !timer && setBillable(!billable)} aria-pressed={billable} title={billable ? "Billable" : "Non-billable"} disabled={!!timer}>
        <Icon name="dollar" /><span className="sr-only">Billable</span>
      </button>
      <span className="timer-clock" aria-live="off">{timer ? elapsed(timer.startedAt!) : "0:00:00"}</span>
      {timer ? (
        <>
          <button className="play stop" onClick={stop} disabled={busy} aria-label="Stop timer" title="Stop timer"><Icon name="stop" /></button>
          <button className="icon-btn" onClick={discard} title="Discard timer" aria-label="Discard timer"><Icon name="trash" /></button>
        </>
      ) : <button className="play" onClick={start} disabled={busy} aria-label="Start timer" title="Start timer"><Icon name="play" /></button>}
    </div>
  );
}
