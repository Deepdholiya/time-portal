import { useState, type DragEvent } from "react";
import { Clock, MessageSquare, Paperclip, Plus } from "lucide-react";
import { Avatar, IconButton } from "@/components/arc";
import { PriorityIcon, STATUSES, STATUS_META, StatusIcon } from "@/components/app/icons";
import { hm } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";
import type { ListTask } from "./lib";
import { BlockedMark, DueText, ProjectChip, SubProgress } from "./task-row";
import s from "./tasks.module.css";

export interface BoardProps {
  tasks: ListTask[];
  meId: number;
  canManage: boolean;
  canCreate: boolean;
  onOpen: (id: number) => void;
  onMove: (task: ListTask, status: TaskStatus) => void;
  onAdd: (defaults: Record<string, unknown>) => void;
  showProject?: boolean;
  hideEmptyBacklog?: boolean;
}

/** Kanban: one column per status, cards drag between columns to change status. */
export function TaskBoard({ tasks, meId, canManage, canCreate, onOpen, onMove, onAdd, showProject = true }: BoardProps) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  const drop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData("text/task-id") || dragId);
    setDragId(null);
    const t = tasks.find((x) => x.id === id);
    if (t && t.status !== status) onMove(t, status);
  };

  return (
    <div className={s.board}>
      {STATUSES.map((st) => {
        const col = tasks.filter((t) => t.status === st);
        return (
          <div
            key={st}
            className={`${s.column} ${over === st ? s.over : ""}`}
            data-status={st}
            onDragOver={(e) => { if (dragId !== null) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== st) setOver(st); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => drop(e, st)}
          >
            <div className={s.columnHeader}>
              <StatusIcon status={st} />
              <span>{STATUS_META[st].label}</span>
              <span className={s.groupCount}>{col.length}</span>
              <span className="grow" />
              {canCreate && <IconButton size="sm" label={`New task in ${STATUS_META[st].label}`} icon={<Plus size={14} />} onClick={() => onAdd({ status: st })} />}
            </div>
            <div className={s.columnBody}>
              {col.map((t) => {
                const movable = canManage || t.assignee?.id === meId || t.creatorId === meId;
                return (
                  <div
                    key={t.id}
                    className={`${s.card} ${dragId === t.id ? s.dragging : ""}`}
                    draggable={movable}
                    data-task-id={t.id}
                    onDragStart={(e) => { e.dataTransfer.setData("text/task-id", String(t.id)); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    onClick={() => onOpen(t.id)}
                    title={movable ? undefined : "You can only move tasks assigned to you"}
                  >
                    <div className={s.cardTop}>
                      <span className="num">{t.key}</span>
                      <span className="grow" />
                      <BlockedMark task={t} />
                      <Avatar name={t.assignee?.name} size={18} />
                    </div>
                    <div className={s.cardTitle}>{t.title}</div>
                    <div className={s.cardMeta}>
                      <PriorityIcon priority={t.priority} />
                      {showProject && <ProjectChip task={t} />}
                      <SubProgress task={t} />
                      {(t.trackedMinutes > 0 || t.estimateHours) && (
                        <span className={s.cardTime} title="Tracked / estimate">
                          <Clock size={11} />{hm(t.trackedMinutes)}{t.estimateHours ? ` / ${t.estimateHours}h` : ""}
                        </span>
                      )}
                      {!!t.commentCount && <span className={s.cardTime}><MessageSquare size={11} />{t.commentCount}</span>}
                      {!!t.attachmentCount && <span className={s.cardTime}><Paperclip size={11} />{t.attachmentCount}</span>}
                      <span className="grow" />
                      <DueText task={t} />
                    </div>
                  </div>
                );
              })}
              {!col.length && <div className={s.columnEmpty}>No tasks</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
