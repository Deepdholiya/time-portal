import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowLeftRight, DollarSign, MoreHorizontal, Pause, Play, Square, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, IconButton, Input, Menu, Popover, Tooltip, toast } from "@/components/ui";
import { elapsedOf, timerActions, timerChanged, useTick } from "@/components/app/timer-widget";
import { del, patch, post } from "@/lib/api";
import { clock, nowTime, today } from "@/lib/format";
import type { Options, TimeEntry } from "@/lib/types";
import { ProjectTaskPicker, type Pick } from "./project-task-picker";
import { defaultBillable, projectPath } from "./time-utils";
import s from "./time.module.css";

export interface TrackerBarHandle { focus: () => void }

/** Start a timer, or continue/switch to the given work when one is already running. */
export async function startOrSwitch(running: TimeEntry | null | undefined, body: { projectId: number; taskId?: number | null; description: string; billable: boolean }) {
  if (running) {
    if (!running.description?.trim()) throw new Error("Describe the running timer's work before switching");
    await post("/time/timer/switch", { ...body, date: today(), startTime: nowTime(), endTime: nowTime() });
    timerChanged();
  } else {
    await timerActions.start(body);
  }
}

export const TrackerBar = forwardRef<TrackerBarHandle, { options: Options | undefined; running: TimeEntry | null | undefined }>(function TrackerBar({ options, running }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  const [desc, setDesc] = useState("");
  const [pick, setPick] = useState<Pick>({ projectId: null, taskId: null });
  const [billable, setBillable] = useState(true);
  const [billTouched, setBillTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const now = useTick(!!running && !running.pausedAt);

  // Mirror the running timer into the bar so it can be edited in place.
  const runningId = running?.id;
  useEffect(() => {
    if (running) {
      setDesc(running.description ?? "");
      setPick({ projectId: running.projectId, taskId: running.taskId ?? null });
      setBillable(running.billable);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningId]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const updateRunning = (body: Record<string, unknown>) => run(async () => { await patch("/time/timer", body); timerChanged(); });

  const choose = (v: Pick) => {
    setPick(v);
    const p = options?.projects.find((x) => x.id === v.projectId);
    if (!running && !billTouched && p) setBillable(defaultBillable(p));
    if (running && v.projectId) updateRunning({ projectId: v.projectId, taskId: v.taskId });
  };

  const start = () => run(async () => {
    if (!pick.projectId) { toast.error("Pick a project or task first"); return; }
    await timerActions.start({ projectId: pick.projectId, taskId: pick.taskId, description: desc.trim(), billable });
    toast.success("Timer started");
  });

  const stop = () => run(async () => {
    if (!desc.trim()) { inputRef.current?.focus(); throw new Error("Describe the work you did before stopping"); }
    const e = await timerActions.stop(desc.trim());
    toast.success(`Logged ${e.minutes} min`, { description: e.description });
    setDesc("");
    setPick({ projectId: null, taskId: null });
    setBillTouched(false);
  });

  const elapsed = running ? elapsedOf(running, now) : 0;

  return (
    <div className={`${s.bar} ${running ? s.running : ""}`}>
      {running && <span className={`${s.pulse} ${running.pausedAt ? s.paused : ""}`} title={running.pausedAt ? "Paused" : "Running"} />}
      <div className={s.barDesc}>
        <Input
          ref={inputRef}
          bare
          aria-label="What are you working on?"
          placeholder={running ? "Describe what you're working on" : "What are you working on?"}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => { if (running && desc.trim() !== (running.description ?? "")) updateRunning({ description: desc.trim() }); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (running) (e.target as HTMLInputElement).blur(); else start(); } }}
        />
      </div>
      <ProjectTaskPicker
        options={options}
        value={pick}
        onChange={choose}
        fallback={running ? { color: running.project?.color, project: projectPath(running.project), task: running.task?.title } : undefined}
      />
      <Tooltip content={billable ? "Billable" : "Non-billable"}>
        <IconButton
          label={billable ? "Billable (click to make non-billable)" : "Non-billable (click to make billable)"}
          className={`${s.billBtn} ${billable ? s.on : ""}`}
          icon={<DollarSign size={15} strokeWidth={billable ? 2.2 : 1.6} />}
          aria-pressed={billable}
          onClick={() => { const v = !billable; setBillable(v); setBillTouched(true); if (running) updateRunning({ billable: v }); }}
        />
      </Tooltip>
      <span className={s.sep} />
      <span className={`${s.clock} ${running ? "" : s.idle}`} aria-live="off">{clock(elapsed)}</span>
      {running ? (
        <>
          {running.pausedAt
            ? <IconButton variant="secondary" label="Resume" icon={<Play size={14} />} disabled={busy} onClick={() => run(timerActions.resume)} />
            : <IconButton variant="secondary" label="Pause" icon={<Pause size={14} />} disabled={busy} onClick={() => run(timerActions.pause)} />}
          <Button variant="danger" icon={<Square size={12} fill="currentColor" />} loading={busy} onClick={stop}>Stop</Button>
          <SwitchPopover options={options} running={running} disabled={busy} />
          <Menu
            placement="bottom-end"
            trigger={<IconButton label="More timer actions" icon={<MoreHorizontal size={15} />} />}
            items={[{ label: "Discard timer", icon: <Trash2 size={14} />, danger: true, onSelect: () => setDiscard(true) }]}
          />
        </>
      ) : (
        <Button variant="primary" icon={<Play size={13} fill="currentColor" />} loading={busy} onClick={start} style={{ minWidth: 84 }}>Start</Button>
      )}
      <ConfirmDialog
        open={discard} onClose={() => setDiscard(false)} danger confirmLabel="Discard"
        title="Discard the running timer?" description="The tracked time won't be saved. This can't be undone."
        loading={busy}
        onConfirm={() => run(async () => { await del("/time/timer/discard"); timerChanged(); setDiscard(false); setDesc(""); setPick({ projectId: null, taskId: null }); toast.info("Timer discarded"); })}
      />
    </div>
  );
});

/** Stop the running timer and start another in one step. */
function SwitchPopover({ options, running, disabled }: { options: Options | undefined; running: TimeEntry; disabled?: boolean }) {
  const [pick, setPick] = useState<Pick>({ projectId: null, taskId: null });
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Popover placement="bottom-end" width={340} trigger={<IconButton label="Switch to another task" icon={<ArrowLeftRight size={14} />} disabled={disabled} />}>
      {(close) => (
        <form
          className="col"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pick.projectId) return toast.error("Pick what to switch to");
            setBusy(true);
            try {
              const p = options?.projects.find((x) => x.id === pick.projectId);
              await startOrSwitch(running, { projectId: pick.projectId, taskId: pick.taskId, description: desc.trim(), billable: defaultBillable(p) });
              toast.success("Switched timer", { description: "The previous timer was stopped and saved." });
              close();
            } catch (err) { toast.error(err); } finally { setBusy(false); }
          }}
        >
          <div className="small strong">Switch to</div>
          <div className="small muted">Stops the current timer and starts a new one now.</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 2 }}>
            <ProjectTaskPicker options={options} value={pick} onChange={setPick} width={320} />
          </div>
          <Input placeholder="Description (optional for tasks)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button type="submit" variant="primary" loading={busy} disabled={!pick.projectId}>Switch timer</Button>
        </form>
      )}
    </Popover>
  );
}
