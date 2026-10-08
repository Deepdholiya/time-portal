import { CalendarClock, Diamond, PartyPopper, Palmtree, Plus } from "lucide-react";
import { Avatar, Button, DatePicker, EmptyState, toast } from "@/components/arc";
import { PriorityIcon, ProjectDot, StatusIcon } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { patch } from "@/lib/api";
import { hm } from "@/lib/format";
import { projectPath } from "../time/time-utils";
import { LEAVE_LABEL, type DayBucket } from "./calendar-data";
import s from "./calendar.module.css";

/** Everything on one day: time entries, tasks due, milestones, leave and holidays. */
export function DayDetail({ date, bucket, canReschedule, showUser, canLog, canEdit, logFor, onChanged }: {
  date: string; bucket: DayBucket; canReschedule: boolean; showUser: boolean; canLog: boolean; canEdit: boolean; logFor?: number; onChanged: () => void;
}) {
  const shell = useShell();
  const reschedule = async (id: number, dueDate: string | null) => {
    if (!dueDate) return;
    try { await patch(`/tasks/${id}`, { dueDate }); toast.success("Task rescheduled"); onChanged(); } catch (e) { toast.error(e); }
  };
  const empty = !bucket.entries.length && !bucket.tasks.length && !bucket.milestones.length && !bucket.leave.length && !bucket.holiday;

  return (
    <div className="col" style={{ gap: 18 }}>
      {(bucket.holiday || bucket.leave.length > 0) && (
        <div className="col" style={{ gap: 4 }}>
          {bucket.holiday && <div className={`${s.chip} ${s.chipHoliday}`} style={{ height: 26 }}><PartyPopper size={13} /><span className="label">{bucket.holiday.name} · company holiday</span></div>}
          {bucket.leave.map((l) => (
            <div key={l.id} className={`${s.chip} ${s.chipLeave} ${l.status === "PENDING" ? s.pending : ""}`} style={{ height: 26 }}>
              <Palmtree size={13} /><span className="label">{l.user.name} · {LEAVE_LABEL[l.type] ?? l.type}{l.halfDay ? " (half day)" : ""}{l.status === "PENDING" ? " · pending" : ""}</span>
            </div>
          ))}
        </div>
      )}

      <section>
        <div className={s.sectionHead}>
          Time <span className="faint num">{bucket.minutes ? hm(bucket.minutes) : ""}</span>
          <span className="grow" />
          {canLog && <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => shell.logTime({ date, userId: logFor }, onChanged)}>Log time</Button>}
        </div>
        {bucket.entries.length === 0 ? <div className="small faint" style={{ padding: "6px 8px" }}>No time logged.</div> : bucket.entries.map((e) => (
          <div key={e.id} className={`${s.itemRow} ${canEdit ? s.click : ""}`} onClick={() => canEdit && shell.editEntry(e.id, onChanged)}>
            <span className={s.timeCol}>{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : "—"}</span>
            <ProjectDot color={e.project?.color} />
            <span className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis">{e.description}</div>
              <div className="tiny faint ellipsis">{projectPath(e.project)}{e.task ? ` · ${e.task.title}` : ""}{showUser && e.user ? ` · ${e.user.name}` : ""}</div>
            </span>
            {showUser && e.user && <Avatar name={e.user.name} size={18} />}
            <span className="num medium">{hm(e.minutes, true)}</span>
          </div>
        ))}
      </section>

      {bucket.tasks.length > 0 && (
        <section>
          <div className={s.sectionHead}>Due</div>
          {bucket.tasks.map((t) => (
            <div key={t.id} className={`${s.itemRow} ${s.click}`} onClick={() => shell.openTask(t.id)}>
              <PriorityIcon priority={t.priority} />
              <span className="faint small num" style={{ width: 56 }}>{t.key}</span>
              <StatusIcon status={t.status} />
              <span className="grow ellipsis">{t.title}</span>
              {t.project && <span className="row small muted" style={{ gap: 6, maxWidth: 160 }}><ProjectDot color={t.project.color} /><span className="ellipsis">{t.project.name}</span></span>}
              {showUser && t.assignee && <Avatar name={t.assignee.name} size={18} />}
              {canReschedule && (
                <span onClick={(e) => e.stopPropagation()}>
                  <DatePicker value={t.dueDate} onChange={(v) => reschedule(t.id, v)} clearable={false} size="sm" appearance="chip" aria-label="Reschedule"
                    trigger={<button type="button" className="prop-chip" title="Reschedule"><CalendarClock size={13} className="faint" /></button>} />
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {bucket.milestones.length > 0 && (
        <section>
          <div className={s.sectionHead}>Milestones</div>
          {bucket.milestones.map((m) => (
            <div key={m.id} className={s.itemRow}>
              <Diamond size={13} color={m.project.color} strokeWidth={2.2} />
              <span className="grow ellipsis">{m.name}</span>
              <span className="small muted">{m.project.name}</span>
              {m.done && <span className="small success">Done</span>}
            </div>
          ))}
        </section>
      )}

      {empty && !canLog && <EmptyState compact title="Nothing on this day" />}
    </div>
  );
}
