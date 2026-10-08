import { Badge, EmptyState, Sheet } from "@/components/ui";
import { PriorityIcon, ProjectDot, StatusIcon } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { dueLabel, fmtDate } from "@/lib/format";
import type { Priority, TaskStatus } from "@/lib/types";
import { STATUS, type WRow } from "./workload";
import s from "./workload.module.css";

/** A person's open tasks behind their planned hours; click a task to open it (and reassign from there). */
export function WorkloadSheet({ row, onClose, from, to }: { row: WRow | null; onClose: () => void; from: string; to: string }) {
  const shell = useShell();
  const st = row ? STATUS[row.status] : null;
  return (
    <Sheet open={!!row} onClose={onClose} width={680} title={row ? <span className="row">{row.user.name}{st && <Badge size="sm" tone={st.tone} dot>{st.label}</Badge>}</span> : null}>
      {row && (
        <div>
          <div className={s.sheetStats}>
            <div><div className="faint small">Capacity</div><div className="medium num">{row.capacityHours.toFixed(1)}h</div></div>
            <div><div className="faint small">Planned</div><div className="medium num">{row.plannedHours.toFixed(1)}h</div></div>
            <div><div className="faint small">Logged</div><div className="medium num">{row.trackedHours.toFixed(1)}h</div></div>
            <div><div className="faint small">Remaining estimate</div><div className="medium num">{row.remainingHours.toFixed(1)}h</div></div>
            <div><div className="faint small">Leave</div><div className="medium num">{row.leaveDays}d</div></div>
          </div>
          <div className="list-group-header" style={{ position: "static" }}>Open tasks <span className="faint small">{fmtDate(from)} – {fmtDate(to)}</span><div className="grow" /><span className="faint small">{row.tasks.length}</span></div>
          {!row.tasks.length ? <EmptyState compact title="No open tasks in this range" /> : row.tasks.map((t) => (
            <div key={t.id} className="list-row clickable" onClick={() => shell.openTask(t.id)}>
              <PriorityIcon priority={t.priority as Priority} />
              <span className="key">{t.key}</span>
              <StatusIcon status={t.status as TaskStatus} />
              <span className="grow ellipsis">{t.title}</span>
              <span className="row gap-4 faint small"><ProjectDot color={t.project.color} />{t.project.name}</span>
              <span className="num small muted" style={{ width: 70, textAlign: "right" }}>{t.plannedHours.toFixed(1)}h<span className="faint"> / {t.estimateHours ?? "–"}</span></span>
              <span className={`small num ${t.overdue ? "danger" : "muted"}`} style={{ width: 80, textAlign: "right" }}>{t.dueDate ? dueLabel(t.dueDate) : "No date"}</span>
            </div>
          ))}
          <div className="faint small" style={{ padding: "10px 20px" }}>Planned hours spread each task's remaining estimate over its working days. Open a task to reassign it.</div>
        </div>
      )}
    </Sheet>
  );
}
