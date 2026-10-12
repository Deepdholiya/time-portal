import { Link } from "react-router-dom";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { useCompanyDay } from "@/components/app/time-range";
import { useApi } from "@/lib/hooks";
import { hm } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { projectPath } from "@/pages/time/time-utils";
import s from "./home.module.css";

/** Today's logged time: log more in one click, or click an entry to change it. */
export function HomeToday() {
  const shell = useShell();
  const { today } = useCompanyDay();
  const q = useApi<TimeEntry[]>("/time", { from: today, to: today });
  const entries = q.data ?? [];
  const total = entries.reduce((a, e) => a + e.minutes, 0);
  return (
    <div className={s.panel}>
      <div className={s.panelHead}><span>Logged today</span><span className="grow" /><Link className="link small" to={`/time?from=${today}&to=${today}`}>Open tracker</Link></div>
      <div className={s.timer}>
        <div className={s.todayTop}>
          <span className={s.timerClock}>{hm(total)}</span>
          <span className="small muted">{q.data ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}` : " "}</span>
        </div>
        <Button variant="secondary" size="lg" icon={<Plus size={16} />} onClick={() => shell.logTime({ date: today }, q.reload)} className={s.logBtn}>Log time</Button>
      </div>
      {entries.length > 0 && (
        <div className={s.todayList}>
          {entries.map((e) => (
            <button key={e.id} type="button" className={s.todayItem} onClick={() => shell.editEntry(e.id, q.reload)} title="Edit this entry">
              <ProjectDot color={e.project?.color ?? "var(--text-3)"} />
              <span className={s.todayText}>
                <span className="ellipsis">{e.description || <span className="muted">No description</span>}</span>
                <span className="small muted ellipsis">{projectPath(e.project)}{e.task ? ` · ${e.task.title}` : ""}</span>
              </span>
              <span className={s.todayDur}>{hm(e.minutes)}</span>
              <Pencil size={13} className={s.todayEdit} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
