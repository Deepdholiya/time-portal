import type { MouseEvent, ReactNode } from "react";
import { AlertTriangle, Ban, Repeat } from "lucide-react";
import { Avatar, Checkbox, Tooltip } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { AssigneePicker, PriorityPicker, StatusPicker } from "@/components/app/properties";
import { dueLabel, fmtDate } from "@/lib/format";
import type { Priority, TaskStatus, UserLite } from "@/lib/types";
import type { ListTask } from "./lib";
import s from "./tasks.module.css";

const stop = (e: MouseEvent) => e.stopPropagation();
/** Wraps inline controls so clicking them (or their popovers) doesn't open the task. */
export const NoOpen = ({ children, className }: { children: ReactNode; className?: string }) => <span className={className} onClick={stop} onDoubleClick={stop}>{children}</span>;

export function BlockedMark({ task }: { task: ListTask }) {
  if (!task.isBlocked && !task.conflict) return null;
  const open = task.blockedBy.filter((b) => b.status !== "DONE");
  const tip = (
    <div className="col" style={{ gap: 2 }}>
      {task.conflict && <span>Schedule conflict: starts before a blocker is due</span>}
      {open.map((b) => <span key={b.id}>Blocked by {b.key} {b.title}{b.dueDate ? ` (due ${fmtDate(b.dueDate)})` : ""}</span>)}
    </div>
  );
  return (
    <Tooltip content={tip}>
      <span className={task.conflict ? s.conflict : s.blocked} aria-label={task.conflict ? "Dependency conflict" : "Blocked"}>
        {task.conflict ? <AlertTriangle size={13} strokeWidth={2} /> : <Ban size={13} strokeWidth={2} />}
      </span>
    </Tooltip>
  );
}

export function DueText({ task }: { task: ListTask }) {
  if (!task.dueDate) return null;
  return <span className={`${s.due} ${task.overdue ? s.overdue : ""}`} title={`Due ${fmtDate(task.dueDate, true)}`}>{dueLabel(task.dueDate)}</span>;
}

export function SubProgress({ task }: { task: ListTask }) {
  if (!task.subtaskCount) return null;
  const pct = task.subtaskDone / task.subtaskCount;
  const C = 2 * Math.PI * 5;
  return (
    <span className={s.subProgress} title={`${task.subtaskDone} of ${task.subtaskCount} sub-tasks done`}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="5" fill="none" stroke="var(--border-strong)" strokeWidth="1.6" /><circle cx="6" cy="6" r="5" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 6 6)" /></svg>
      {task.subtaskDone}/{task.subtaskCount}
    </span>
  );
}

export function ProjectChip({ task }: { task: ListTask }) {
  if (!task.project) return null;
  const top = task.project.parent ?? task.project;
  return (
    <span className={s.projectChip} title={task.project.parent ? `${task.project.parent.name} › ${task.project.name}` : task.project.name}>
      <ProjectDot color={top.color} size={7} />
      <span className="ellipsis">{task.project.name}</span>
    </span>
  );
}

export interface RowProps {
  task: ListTask;
  users: UserLite[];
  meId: number;
  canManage: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: number, shift: boolean) => void;
  onOpen: (id: number) => void;
  onPatch: (task: ListTask, body: Record<string, unknown>) => void;
  showProject?: boolean;
  focused?: boolean;
}

/** One 36px Linear-style issue row with inline status, priority and assignee pickers. */
export function TaskRow({ task, users, meId, canManage, selectable, selected, onToggle, onOpen, onPatch, showProject = true, focused }: RowProps) {
  const own = canManage || task.assignee?.id === meId || task.creatorId === meId;
  return (
    <div
      className={`list-row clickable ${s.row} ${selected ? "selected" : ""} ${focused ? s.focused : ""}`}
      onClick={() => onOpen(task.id)}
      role="button"
      tabIndex={-1}
      data-task-id={task.id}
    >
      {selectable && (
        <NoOpen className={`${s.check} ${selected ? s.checkOn : ""}`}>
          <Checkbox checked={!!selected} onChange={() => onToggle?.(task.id, false)} aria-label={`Select ${task.key}`} />
        </NoOpen>
      )}
      <NoOpen><PriorityPicker value={task.priority} disabled={!own} onChange={(p: Priority) => onPatch(task, { priority: p })} /></NoOpen>
      <span className="key">{task.key}</span>
      <NoOpen><StatusPicker value={task.status} disabled={!own} onChange={(st: TaskStatus) => onPatch(task, { status: st })} /></NoOpen>
      <span className={`${s.title} ellipsis`}>{task.title}</span>
      {task.recurrence && <Repeat size={12} className="faint" aria-label={`Repeats ${task.recurrence.toLowerCase()}`} />}
      <SubProgress task={task} />
      <span className="grow" />
      <span className={`${s.tags} hide-sm`}>
        {task.tags.slice(0, 2).map((t) => <span key={t} className={s.tag}><span className={s.tagDot} />{t}</span>)}
        {task.tags.length > 2 && <span className="faint small">+{task.tags.length - 2}</span>}
      </span>
      {showProject && <span className="hide-sm"><ProjectChip task={task} /></span>}
      <BlockedMark task={task} />
      <DueText task={task} />
      <NoOpen className={s.assignee}>
        <AssigneePicker value={task.assignee?.id ?? null} users={users} disabled={!canManage} onChange={(id) => onPatch(task, { assigneeId: id })} />
      </NoOpen>
    </div>
  );
}

export function AvatarFor({ name }: { name?: string | null }) {
  return <Avatar name={name} size={18} />;
}
