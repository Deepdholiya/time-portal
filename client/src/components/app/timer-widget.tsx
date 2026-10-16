import { useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { Link } from "react-router-dom";
import { IconButton, Input, Popover, Button, toast } from "@/components/arc";
import { post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { clock, nowTime } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { ProjectDot } from "./icons";
import s from "./sidebar.module.css";

/** Announce timer changes so the sidebar widget and Time tracker page stay in sync. */
export const timerChanged = () => { invalidate("/time"); invalidate("/tasks"); window.dispatchEvent(new Event("tp:timer")); };

export function elapsedOf(t: TimeEntry, now = Date.now()) {
  if (t.pausedAt || !t.startedAt) return t.accumulatedSec ?? 0;
  return (t.accumulatedSec ?? 0) + Math.max(0, (now - new Date(t.startedAt).getTime()) / 1000);
}

/** Shared timer actions used by the widget, the Time tracker page and task panels. */
export const timerActions = {
  start: async (body: { projectId?: number; taskId?: number | null; description?: string; billable?: boolean }) => {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const r = await post<TimeEntry>("/time/timer/start", { ...body, date, startTime: nowTime() });
    timerChanged();
    return r;
  },
  pause: async () => { await post("/time/timer/pause"); timerChanged(); },
  resume: async () => { await post("/time/timer/resume"); timerChanged(); },
  stop: async (description?: string) => { const r = await post<TimeEntry>("/time/timer/stop", { endTime: nowTime(), description: description || undefined }); timerChanged(); return r; },
};

export function useRunningTimer() {
  const q = useApi<TimeEntry | null>("/time/timer");
  useEffect(() => {
    const h = () => q.reload();
    window.addEventListener("tp:timer", h);
    const i = setInterval(h, 60_000);
    return () => { window.removeEventListener("tp:timer", h); clearInterval(i); };
  }, [q.reload]);
  return q;
}

export function useTick(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, [active]);
  return now;
}

export function TimerWidget() {
  const { data: t } = useRunningTimer();
  const now = useTick(!!t && !t.pausedAt);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  if (!t) return null;
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { toast.error(e); } finally { setBusy(false); } };
  const stop = async (close?: () => void) => run(async () => { const e = await timerActions.stop(desc); toast.success(`Logged ${Math.round(e.minutes)} min`, { description: e.description }); close?.(); setDesc(""); });
  return (
    <div className={s.timer} aria-label="Running timer">
      <div className="row between">
        <span className="row gap-4"><span className={`${s.pulse} ${t.pausedAt ? s.paused : ""}`} /><span className={s.timerClock}>{clock(elapsedOf(t, now))}</span></span>
        <span className="row gap-4">
          {t.pausedAt
            ? <IconButton size="sm" label="Resume timer" icon={<Play size={14} />} disabled={busy} onClick={() => run(timerActions.resume)} />
            : <IconButton size="sm" label="Pause timer" icon={<Pause size={14} />} disabled={busy} onClick={() => run(timerActions.pause)} />}
          {t.description
            ? <IconButton size="sm" label="Stop timer" icon={<Square size={13} />} disabled={busy} onClick={() => stop()} />
            : (
              <Popover placement="top-start" trigger={<IconButton size="sm" label="Stop timer" icon={<Square size={13} />} />}>
                {(close) => (
                  <form className="col" style={{ width: 240 }} onSubmit={(e) => { e.preventDefault(); stop(close); }}>
                    <div className="small muted">What did you work on?</div>
                    <Input autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the work" />
                    <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!desc.trim()}>Stop and save</Button>
                  </form>
                )}
              </Popover>
            )}
        </span>
      </div>
      <Link to="/time" className="small" style={{ minWidth: 0 }}>
        <div className="row gap-4"><ProjectDot color={t.project?.color} /><span className="ellipsis muted">{t.task?.title ?? t.project?.name}</span></div>
        {t.description && <div className="ellipsis faint">{t.description}</div>}
      </Link>
    </div>
  );
}
