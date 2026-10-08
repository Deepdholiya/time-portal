import { useState } from "react";
import { Copy, DollarSign, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";
import { ConfirmDialog, IconButton, Menu, Tooltip, toast } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { timerChanged } from "@/components/app/timer-widget";
import { del, post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { addDays, fmtDate, fmtDay, hm, today } from "@/lib/format";
import type { Options, TimeEntry } from "@/lib/types";
import { startOrSwitch } from "./tracker-bar";
import { projectPath, taskKeyOf } from "./time-utils";
import s from "./time.module.css";

export const afterTimeChange = () => { invalidate("/time"); invalidate("/timesheets"); invalidate("/analytics"); invalidate("/calendar"); };

function dayLabel(d: string) {
  const t = today();
  if (d === t) return "Today";
  if (d === addDays(t, -1)) return "Yesterday";
  return fmtDay(d);
}

/** Entries grouped by week, then by day, newest first, with day and week totals. */
export function EntryList({ entries, weeks, weekStartOf, options, running, onChanged }: {
  entries: TimeEntry[]; weeks: string[]; weekStartOf: (d: string) => string; options: Options | undefined; running: TimeEntry | null | undefined; onChanged: () => void;
}) {
  return (
    <>
      {weeks.map((w) => {
        const inWeek = entries.filter((e) => weekStartOf(e.date) === w);
        const total = inWeek.reduce((a, e) => a + e.minutes, 0);
        const days = [...new Set(inWeek.map((e) => e.date))].sort().reverse();
        const isThis = w === weekStartOf(today());
        return (
          <div key={w}>
            <div className={s.weekHead}>
              <span>{isThis ? "This week" : w === addDays(weekStartOf(today()), -7) ? "Last week" : `Week of ${fmtDate(w)}`}</span>
              <span className="faint small" style={{ fontWeight: 400 }}>{fmtDate(w)} – {fmtDate(addDays(w, 6))}</span>
              <span className="grow" />
              <span className="small muted">Week total</span>
              <span className="num strong">{hm(total)}</span>
            </div>
            {days.length === 0 && <div className={s.dayHead} style={{ justifyContent: "center" }}>No time logged this week</div>}
            {days.map((d) => {
              const list = inWeek.filter((e) => e.date === d);
              return (
                <div key={d}>
                  <div className={s.dayHead}>
                    <span className={d === today() ? s.today : undefined}>{dayLabel(d)}</span>
                    {d !== today() && d !== addDays(today(), -1) ? null : <span className="faint">{fmtDate(d)}</span>}
                    <span className="grow" />
                    <span className="num medium" style={{ color: "var(--text)" }}>{hm(list.reduce((a, e) => a + e.minutes, 0))}</span>
                  </div>
                  {list.map((e) => <EntryRow key={e.id} entry={e} options={options} running={running} onChanged={onChanged} />)}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function EntryRow({ entry: e, options, running, onChanged }: { entry: TimeEntry; options: Options | undefined; running: TimeEntry | null | undefined; onChanged: () => void }) {
  const shell = useShell();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const edit = () => shell.editEntry(e.id, () => { afterTimeChange(); onChanged(); });

  const duplicate = async () => {
    try {
      // Duplicates keep the duration but drop the clock range so they never overlap the original.
      await post("/time", { projectId: e.projectId, taskId: e.taskId ?? null, date: e.date, minutes: e.minutes, description: e.description, billable: e.billable });
      toast.success("Entry duplicated");
      afterTimeChange();
      onChanged();
    } catch (err) { toast.error(err); }
  };
  const cont = async () => {
    try {
      await startOrSwitch(running, { projectId: e.projectId, taskId: e.taskId ?? null, description: e.description, billable: e.billable });
      toast.success("Timer started", { description: e.description });
      timerChanged();
    } catch (err) { toast.error(err); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await del(`/time/${e.id}`);
      toast.success("Entry deleted");
      setConfirm(false);
      afterTimeChange();
      onChanged();
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  const key = taskKeyOf(options, e.task?.number);
  return (
    <div className={s.entry}>
      <span className={`${s.entryDesc} ellipsis`} onClick={edit} title={e.description}>{e.description}</span>
      <span className={s.entryProject}>
        <ProjectDot color={e.project?.color} />
        <span className="ellipsis" style={{ flexShrink: 0, maxWidth: "60%" }}>{projectPath(e.project)}</span>
        {e.task && <span className="ellipsis faint" title={e.task.title}>· {e.task.title}</span>}
      </span>
      <span className={s.entryKey}>{key}</span>
      <span className={s.entryBill}>
        <Tooltip content={e.billable ? "Billable" : "Non-billable"}>
          <DollarSign size={13} color={e.billable ? "var(--accent-text)" : "var(--border-strong)"} strokeWidth={2} aria-label={e.billable ? "Billable" : "Non-billable"} />
        </Tooltip>
      </span>
      <span className={s.entryTimes}>{e.startTime && e.endTime ? `${e.startTime} – ${e.endTime}` : <span className="faint">—</span>}</span>
      <span className={s.entryDur}>{hm(e.minutes, true)}</span>
      <span className={s.entryActions}>
        <IconButton size="sm" label="Continue: start a timer for this" icon={<Play size={13} />} onClick={cont} />
        <IconButton size="sm" label="Edit entry" icon={<Pencil size={13} />} onClick={edit} />
        <Menu
          placement="bottom-end"
          trigger={<IconButton size="sm" label="More actions" icon={<MoreHorizontal size={14} />} />}
          items={[
            { label: "Edit", icon: <Pencil size={14} />, onSelect: edit },
            { label: "Duplicate", icon: <Copy size={14} />, onSelect: duplicate },
            { label: "Continue timer", icon: <Play size={14} />, onSelect: cont },
            { type: "separator" },
            { label: "Delete", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirm(true) },
          ]}
        />
      </span>
      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} danger confirmLabel="Delete" loading={busy}
        title="Delete this time entry?" description={`${hm(e.minutes)} on ${fmtDate(e.date)}: “${e.description}”. This can't be undone.`}
      />
    </div>
  );
}
