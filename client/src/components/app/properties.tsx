import type { ReactNode } from "react";
import { Combobox } from "@/components/arc";
import type { Priority, TaskStatus, UserLite } from "@/lib/types";
import { Avatar } from "@/components/arc";
import { PRIORITIES, PRIORITY_META, PriorityIcon, STATUSES, STATUS_META, StatusIcon } from "./icons";

const chip = (children: ReactNode, label: string) => (
  <button type="button" aria-label={label} className="prop-chip">{children}</button>
);

/** Status picker rendered as an icon (list rows) or icon + label (detail panel). */
export function StatusPicker({ value, onChange, withLabel, disabled }: { value: TaskStatus; onChange: (s: TaskStatus) => void; withLabel?: boolean; disabled?: boolean }) {
  if (disabled) return <span className="row gap-4" title={STATUS_META[value].label}><StatusIcon status={value} />{withLabel && STATUS_META[value].label}</span>;
  return (
    <Combobox
      value={value}
      onChange={(v) => v && onChange(v as TaskStatus)}
      options={STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label, icon: <StatusIcon status={s} /> }))}
      searchPlaceholder="Change status…"
      width={200}
      trigger={chip(<><StatusIcon status={value} />{withLabel && STATUS_META[value].label}</>, `Status: ${STATUS_META[value].label}`)}
    />
  );
}

export function PriorityPicker({ value, onChange, withLabel, disabled }: { value: Priority; onChange: (p: Priority) => void; withLabel?: boolean; disabled?: boolean }) {
  if (disabled) return <span className="row gap-4" title={PRIORITY_META[value].label}><PriorityIcon priority={value} />{withLabel && PRIORITY_META[value].label}</span>;
  return (
    <Combobox
      value={value}
      onChange={(v) => v && onChange(v as Priority)}
      options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label, icon: <PriorityIcon priority={p} /> }))}
      searchPlaceholder="Set priority…"
      width={190}
      trigger={chip(<><PriorityIcon priority={value} />{withLabel && PRIORITY_META[value].label}</>, `Priority: ${PRIORITY_META[value].label}`)}
    />
  );
}

export function AssigneePicker({ value, users, onChange, withLabel, disabled }: { value?: number | null; users: UserLite[]; onChange: (id: number | null) => void; withLabel?: boolean; disabled?: boolean }) {
  const u = users.find((x) => x.id === value);
  const face = <><Avatar name={u?.name} size={18} />{withLabel && <span className={u ? "" : "faint"}>{u?.name ?? "Unassigned"}</span>}</>;
  if (disabled) return <span className="row gap-4">{face}</span>;
  return (
    <Combobox
      value={value ?? null}
      clearable
      clearLabel="Unassigned"
      onChange={(v) => onChange(v ? Number(v) : null)}
      options={users.map((x) => ({ value: x.id, label: x.name, icon: <Avatar name={x.name} size={16} />, hint: x.title ?? undefined }))}
      searchPlaceholder="Assign to…"
      width={240}
      trigger={chip(face, `Assignee: ${u?.name ?? "Unassigned"}`)}
    />
  );
}
