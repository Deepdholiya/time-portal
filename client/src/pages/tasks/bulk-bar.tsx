import { useState } from "react";
import { CalendarDays, CircleDashed, Trash2, UserRound, X } from "lucide-react";
import { Avatar, Combobox, ConfirmDialog, DatePicker, IconButton, toast } from "@/components/arc";
import { PRIORITIES, PRIORITY_META, PriorityIcon, STATUSES, STATUS_META, StatusIcon } from "@/components/app/icons";
import { post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { plural } from "@/lib/format";
import type { UserLite } from "@/lib/types";
import s from "./tasks.module.css";

/** Floating action bar for multi-selected tasks; everything goes through POST /tasks/bulk. */
export function BulkBar({ ids, users, onClear, onDone }: { ids: number[]; users: UserLite[]; onClear: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ids.length) return null;

  const run = async (body: Record<string, unknown>, label: string) => {
    setBusy(true);
    try {
      const r = await post<{ updated: number }>("/tasks/bulk", { ids, ...body });
      toast.success(`${label} ${plural(r.updated, "task")}`);
      invalidate("/tasks");
      invalidate("/projects");
      onDone();
    } catch (e) {
      toast.error(e);
      invalidate("/tasks");
    } finally {
      setBusy(false);
    }
  };

  const btn = (icon: React.ReactNode, label: string) => <button type="button" className={s.bulkBtn} disabled={busy}>{icon}{label}</button>;

  return (
    <div className={s.bulk} role="toolbar" aria-label="Bulk actions">
      <span className={s.bulkCount}>{ids.length} selected</span>
      <IconButton size="sm" label="Clear selection" icon={<X size={14} />} onClick={onClear} />
      <span className={s.bulkSep} />
      <Combobox
        value={null} width={200} searchPlaceholder="Set status…"
        options={STATUSES.map((v) => ({ value: v, label: STATUS_META[v].label, icon: <StatusIcon status={v} /> }))}
        onChange={(v) => v && run({ patch: { status: v } }, "Updated")}
        trigger={btn(<CircleDashed size={14} />, "Status")}
      />
      <Combobox
        value={null} width={190} searchPlaceholder="Set priority…"
        options={PRIORITIES.map((v) => ({ value: v, label: PRIORITY_META[v].label, icon: <PriorityIcon priority={v} /> }))}
        onChange={(v) => v && run({ patch: { priority: v } }, "Updated")}
        trigger={btn(<PriorityIcon priority="HIGH" />, "Priority")}
      />
      <Combobox
        value={null} width={240} searchPlaceholder="Assign to…" clearable clearLabel="Unassigned"
        options={users.map((u) => ({ value: u.id, label: u.name, icon: <Avatar name={u.name} size={16} /> }))}
        onChange={(v) => run({ patch: { assigneeId: v ? Number(v) : null } }, "Reassigned")}
        trigger={btn(<UserRound size={14} />, "Assignee")}
      />
      <DatePicker value={null} onChange={(d) => run({ patch: { dueDate: d } }, d ? "Rescheduled" : "Cleared due date on")} trigger={btn(<CalendarDays size={14} />, "Due date")} />
      <span className={s.bulkSep} />
      <button type="button" className={s.bulkBtn} style={{ color: "var(--red)" }} onClick={() => setConfirm(true)} disabled={busy}><Trash2 size={14} />Delete</button>
      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} danger confirmLabel="Delete" loading={busy}
        title={`Delete ${plural(ids.length, "task")}?`}
        description="Sub-tasks, comments and attachments go with them. Logged time stays but is no longer linked to a task."
        onConfirm={async () => { await run({ delete: true }, "Deleted"); setConfirm(false); }}
      />
    </div>
  );
}
