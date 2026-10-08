import { useState } from "react";
import { Link } from "react-router-dom";
import { Pause, Play, Plus, Square } from "lucide-react";
import { Button, IconButton, Input, toast } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { elapsedOf, timerActions, useRunningTimer, useTick } from "@/components/app/timer-widget";
import { clock, today } from "@/lib/format";
import type { Options } from "@/lib/types";
import { ProjectTaskPicker, type Pick } from "../time/project-task-picker";
import { defaultBillable, projectPath } from "../time/time-utils";
import s from "./home.module.css";

/** Running timer with controls, or a quick start form. */
export function HomeTimer({ options }: { options: Options | undefined }) {
  const shell = useShell();
  const { data: t } = useRunningTimer();
  const now = useTick(!!t && !t.pausedAt);
  const [pick, setPick] = useState<Pick>({ projectId: null, taskId: null });
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { toast.error(e); } finally { setBusy(false); } };

  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <span>{t ? (t.pausedAt ? "Timer paused" : "Timer running") : "Track time"}</span>
        <span className="grow" />
        <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => shell.logTime({ date: today() })}>Log manually</Button>
      </div>
      {t ? (
        <div className={s.timer}>
          <div className="row between">
            <span className={s.timerClock}>{clock(elapsedOf(t, now))}</span>
            <span className="row gap-4">
              {t.pausedAt
                ? <IconButton variant="secondary" label="Resume" icon={<Play size={14} />} disabled={busy} onClick={() => run(timerActions.resume)} />
                : <IconButton variant="secondary" label="Pause" icon={<Pause size={14} />} disabled={busy} onClick={() => run(timerActions.pause)} />}
              <Button variant="danger" icon={<Square size={11} fill="currentColor" />} loading={busy}
                onClick={() => run(async () => {
                  if (!t.description?.trim()) { toast.error("Add a description in the time tracker before stopping"); return; }
                  const e = await timerActions.stop();
                  toast.success(`Logged ${e.minutes} min`, { description: e.description });
                })}>Stop</Button>
            </span>
          </div>
          <div className="row" style={{ minWidth: 0 }}><ProjectDot color={t.project?.color} /><span className="ellipsis small">{projectPath(t.project)}{t.task ? ` · ${t.task.title}` : ""}</span></div>
          <Link to="/time" className="small ellipsis muted">{t.description || <span className="faint">No description yet. Open the tracker to add one.</span>}</Link>
        </div>
      ) : (
        <form className={s.timer} onSubmit={(e) => {
          e.preventDefault();
          if (!pick.projectId) { toast.error("Pick a project or task first"); return; }
          run(async () => {
            await timerActions.start({ projectId: pick.projectId!, taskId: pick.taskId, description: desc.trim(), billable: defaultBillable(options?.projects.find((p) => p.id === pick.projectId)) });
            toast.success("Timer started");
            setDesc(""); setPick({ projectId: null, taskId: null });
          });
        }}>
          <Input placeholder="What are you working on?" value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Timer description" />
          <div className="row between" style={{ gap: 6 }}>
            <div style={{ minWidth: 0, flex: 1, marginLeft: -8 }}><ProjectTaskPicker options={options} value={pick} onChange={setPick} width={340} /></div>
            <Button type="submit" variant="primary" size="sm" icon={<Play size={11} fill="currentColor" />} loading={busy}>Start</Button>
          </div>
        </form>
      )}
    </div>
  );
}
