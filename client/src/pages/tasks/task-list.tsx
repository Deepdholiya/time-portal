import { ChevronDown, Plus } from "lucide-react";
import { Avatar, Checkbox, IconButton } from "@/components/arc";
import { PriorityIcon, ProjectDot, StatusIcon } from "@/components/app/icons";
import { useLocal } from "@/lib/hooks";
import type { UserLite } from "@/lib/types";
import type { Group, ListTask } from "./lib";
import { NoOpen, TaskRow } from "./task-row";
import s from "./tasks.module.css";

export function GroupIcon({ g }: { g: Group }) {
  if (g.status) return <StatusIcon status={g.status} />;
  if (g.priority) return <PriorityIcon priority={g.priority} />;
  if (g.color) return <ProjectDot color={g.color} />;
  if (g.key !== "all" && g.userName !== undefined) return <Avatar name={g.userName} size={16} />;
  return null;
}

export interface ListProps {
  groups: Group[];
  storageKey: string;
  users: UserLite[];
  meId: number;
  canManage: boolean;
  canCreate: boolean;
  selected: Set<number>;
  onSelect: (ids: number[], on: boolean) => void;
  onOpen: (id: number) => void;
  onPatch: (task: ListTask, body: Record<string, unknown>) => void;
  onAdd: (defaults: Record<string, unknown>) => void;
  showProject?: boolean;
  focusedId?: number | null;
  /** Multi-select checkboxes; defaults to managers only (bulk edits need task management). */
  selectable?: boolean;
}

/** Issue list grouped into collapsible sections with counts, like Linear. */
export function TaskList({ groups, storageKey, users, meId, canManage, canCreate, selected, onSelect, onOpen, onPatch, onAdd, showProject, focusedId, selectable = canManage }: ListProps) {
  const [collapsed, setCollapsed] = useLocal<string[]>(`${storageKey}:collapsed`, []);
  const toggle = (k: string) => setCollapsed((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  return (
    <div className={`list ${s.listWrap} ${selected.size ? s.selecting : ""}`}>
      {groups.map((g) => {
        const closed = collapsed.includes(g.key);
        const ids = g.tasks.map((t) => t.id);
        const allOn = ids.length > 0 && ids.every((i) => selected.has(i));
        const someOn = ids.some((i) => selected.has(i));
        return (
          <section key={g.key}>
            {groups.length > 1 || g.key !== "all" ? (
              <div className={`list-group-header ${s.groupHeader}`} onClick={() => toggle(g.key)} aria-expanded={!closed}>
                {selectable && (
                  <NoOpen className={`${s.check} ${someOn ? s.checkOn : ""}`}>
                    <Checkbox checked={allOn} indeterminate={someOn && !allOn} onChange={(v) => onSelect(ids, v)} aria-label={`Select all in ${g.label}`} />
                  </NoOpen>
                )}
                <ChevronDown size={14} className={`${s.chev} ${closed ? s.collapsed : ""}`} />
                <GroupIcon g={g} />
                <span>{g.label}</span>
                <span className={s.groupCount}>{g.tasks.length}</span>
                {canCreate && (
                  <NoOpen className={s.groupAdd}>
                    <IconButton size="sm" label={`New task in ${g.label}`} icon={<Plus size={14} />} onClick={() => onAdd(g.defaults)} />
                  </NoOpen>
                )}
              </div>
            ) : null}
            {!closed && g.tasks.map((t) => (
              <TaskRow
                key={t.id} task={t} users={users} meId={meId} canManage={canManage}
                selectable={selectable} selected={selected.has(t.id)} onToggle={(id) => onSelect([id], !selected.has(id))}
                onOpen={onOpen} onPatch={onPatch} showProject={showProject} focused={focusedId === t.id}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
