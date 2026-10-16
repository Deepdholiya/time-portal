import { useState } from "react";
import { Diamond, PartyPopper, Palmtree } from "lucide-react";
import { StatusIcon } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { dayName, hm, today, weekday } from "@/lib/format";
import { entriesByProject, LEAVE_LABEL, type DayBucket, type Layers } from "./calendar-data";
import s from "./calendar.module.css";

interface Props {
  days: string[];
  view: "month" | "week";
  /** Month being shown (YYYY-MM), to dim days outside it. */
  month?: string;
  buckets: Record<string, DayBucket>;
  layers: Layers;
  workDays: Set<number>;
  canReschedule: boolean;
  showUser: boolean;
  onOpenDay: (d: string) => void;
  onMoveTask: (taskId: number, date: string) => void;
}

export function CalendarGrid({ days, view, month, buckets, layers, workDays, canReschedule, showUser, onOpenDay, onMoveTask }: Props) {
  const shell = useShell();
  const [over, setOver] = useState<string | null>(null);
  const t0 = today();
  const max = view === "month" ? 4 : 40;

  return (
    <>
      <div className={s.weekdays}>{days.slice(0, 7).map((d) => <div key={d}>{view === "week" ? `${dayName(d)} ${Number(d.slice(8))}` : dayName(d)}</div>)}</div>
      <div className={view === "month" ? s.month : s.week}>
        {days.map((d) => {
          const b = buckets[d];
          const chips: React.ReactNode[] = [];
          if (layers.leave && b.holiday) chips.push(<div key="h" className={`${s.chip} ${s.chipHoliday}`} title={b.holiday.name}><PartyPopper size={11} /><span className="label">{b.holiday.name}</span></div>);
          if (layers.leave) for (const l of b.leave) chips.push(
            <div key={`l${l.id}`} className={`${s.chip} ${s.chipLeave} ${l.status === "PENDING" ? s.pending : ""}`} title={`${l.user.name}: ${LEAVE_LABEL[l.type] ?? l.type}${l.status === "PENDING" ? " (pending approval)" : ""}`}>
              <Palmtree size={11} /><span className="label">{showUser ? l.user.name.split(" ")[0] : LEAVE_LABEL[l.type] ?? "Leave"}{l.halfDay ? " ½" : ""}</span>
            </div>,
          );
          if (layers.milestones) for (const m of b.milestones) chips.push(
            <div key={`m${m.id}`} className={s.chip} title={`${m.name} · ${m.project.name}`}><Diamond size={11} color={m.project.color} strokeWidth={2.4} /><span className="label">{m.name}</span></div>,
          );
          if (layers.tasks) for (const t of b.tasks) chips.push(
            <div
              key={`t${t.id}`}
              className={`${s.chip} ${s.chipTask} ${t.status === "DONE" ? s.done : ""}`}
              title={`${t.key} ${t.title}${t.assignee ? ` · ${t.assignee.name}` : ""}${canReschedule ? " (drag to reschedule)" : ""}`}
              draggable={canReschedule}
              onDragStart={(e) => { e.dataTransfer.setData("text/task", String(t.id)); e.dataTransfer.effectAllowed = "move"; }}
              onClick={(e) => { e.stopPropagation(); shell.openTask(t.id); }}
            >
              <StatusIcon status={t.status} size={12} /><span className="label">{t.title}</span>
            </div>,
          );
          if (layers.time) {
            if (view === "month") for (const g of entriesByProject(b.entries)) chips.push(
              <div key={`p${g.id}`} className={`${s.chip} ${s.chipEntry}`} style={{ "--chip": g.color } as React.CSSProperties} title={`${g.name}: ${hm(g.minutes)}`}>
                <span className="label">{g.name}</span><span className="meta">{hm(g.minutes, true)}</span>
              </div>,
            );
            else for (const e of b.entries) chips.push(
              <div key={`e${e.id}`} className={`${s.chip} ${s.chipEntry}`} style={{ "--chip": e.project?.color ?? "var(--text-3)", height: "auto", minHeight: 20, padding: "3px 5px", alignItems: "flex-start" } as React.CSSProperties}
                title={`${e.description} · ${e.project?.name ?? ""}`}>
                <span className="label" style={{ whiteSpace: "normal", lineHeight: 1.3 }}>
                  <span className="meta" style={{ display: "block" }}>{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : hm(e.minutes)}{showUser && e.user ? ` · ${e.user.name.split(" ")[0]}` : ""}</span>
                  {e.description}
                </span>
              </div>,
            );
          }
          const off = !workDays.has(weekday(d));
          const outside = month ? d.slice(0, 7) !== month : false;
          return (
            <div
              key={d}
              className={`${s.cell} ${view === "week" ? s.weekCell : ""} ${outside ? s.outside : off ? s.off : ""} ${b.holiday && layers.leave ? s.holiday : ""} ${over === d ? s.dropTarget : ""}`}
              onClick={() => onOpenDay(d)}
              onDragOver={canReschedule ? (e) => { if (e.dataTransfer.types.includes("text/task")) { e.preventDefault(); setOver(d); } } : undefined}
              onDragLeave={() => setOver((o) => (o === d ? null : o))}
              onDrop={canReschedule ? (e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData("text/task")); if (id) onMoveTask(id, d); } : undefined}
              role="button"
              aria-label={`${d}${b.minutes ? `, ${hm(b.minutes)} logged` : ""}`}
            >
              <div className={s.cellHead}>
                <span className={`${s.num} ${d === t0 ? s.today : ""}`}>{Number(d.slice(8))}</span>
                {layers.time && <span className={`${s.hours} ${b.minutes ? s.has : ""}`}>{b.minutes ? hm(b.minutes) : ""}</span>}
              </div>
              {chips.slice(0, max)}
              {chips.length > max && <span className={s.more}>+{chips.length - max} more</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
