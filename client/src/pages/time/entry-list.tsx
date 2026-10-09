import { useState } from "react";
import { CalendarDays, Clock3, Copy, DollarSign, FolderKanban, Lock, MoreHorizontal, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { Badge, Button, ConfirmDialog, IconButton, Menu, Tooltip, toast } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { useCompanyDay } from "@/components/app/time-range";
import { del, post } from "@/lib/api";
import { addDays, fmtDate, fmtDay, hm } from "@/lib/format";
import type { DayState, Options, TimeEntry } from "@/lib/types";
import { DAY_STATUS, LOCKED, afterTimeChange, projectPath, taskKeyOf } from "./time-utils";
import { reopenDay, submitDays } from "./day-actions";
import s from "./time.module.css";


/** "Today", "Yesterday", or "Mon 6". */
export function dayLabel(d: string, today: string) {
  if (d === today) return "Today";
  if (d === addDays(today, -1)) return "Yesterday";
  return fmtDay(d);
}

export function DayBadge({ day }: { day?: DayState }) {
  if (!day) return null;
  const st = DAY_STATUS[day.status];
  const hint = day.status === "SAVED" && day.overdue ? "Changed after the cutoff, so it wasn't submitted automatically. Submit it when you're ready." : st.hint;
  return (
    <Tooltip content={day.note ? `${hint} ${day.note}` : hint}>
      <span><Badge size="sm" tone={day.status === "SAVED" && day.overdue ? "orange" : st.tone} icon={LOCKED.includes(day.status) ? <Lock size={10} /> : undefined}>{day.status === "SAVED" && day.overdue ? "Not submitted" : st.label}</Badge></span>
    </Tooltip>
  );
}

/** Entries grouped by date, newest first, with a total and the submission state for each day. */
export function EntryList({ entries, days, options, onChanged, readOnly }: {
  entries: TimeEntry[]; days: Map<string, DayState>; options: Options | undefined; onChanged: () => void; readOnly?: boolean;
}) {
  const shell = useShell();
  const { today } = useCompanyDay();
  const dates = [...new Set(entries.map((e) => e.date))].sort().reverse();
  return (
    <>
      {dates.map((d) => {
        const list = entries.filter((e) => e.date === d).sort((a, b) => (b.startTime ?? "").localeCompare(a.startTime ?? ""));
        const day = days.get(d);
        const locked = !!day && LOCKED.includes(day.status);
        const canSubmit = !readOnly && day && !locked;
        return (
          <section key={d} aria-label={`${fmtDay(d)} entries`}>
            <div className={s.dayHead}>
              <span className={d === today ? s.today : s.dayName}>{dayLabel(d, today)}</span>
              <span className="faint">{fmtDate(d)}</span>
              <DayBadge day={day} />
              {day?.note && !locked && <span className={`${s.dayNote} ellipsis`} title={day.note}>{day.note}</span>}
              <span className="grow" />
              {!readOnly && !locked && <IconButton size="sm" label={`Add entry on ${fmtDate(d)}`} icon={<Plus size={13} />} onClick={() => shell.logTime({ date: d }, onChanged)} />}
              {canSubmit && <Button size="sm" variant="ghost" icon={<Send size={12} />} onClick={() => submitDays([d]).then(onChanged)}>{day.status === "SAVED" ? "Submit day" : "Resubmit"}</Button>}
              {!readOnly && day?.status === "SUBMITTED" && <Button size="sm" variant="ghost" icon={<Undo2 size={12} />} onClick={() => reopenDay(d).then(onChanged)}>Reopen to correct</Button>}
              <span className={s.dayTotal}>{hm(list.reduce((a, e) => a + e.minutes, 0))}</span>
            </div>
            {list.map((e) => <EntryRow key={e.id} entry={e} options={options} locked={locked || !!readOnly} today={today} onChanged={onChanged} />)}
          </section>
        );
      })}
    </>
  );
}

function EntryRow({ entry: e, options, locked, today, onChanged }: { entry: TimeEntry; options: Options | undefined; locked: boolean; today: string; onChanged: () => void }) {
  const shell = useShell();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const edit = (focus?: Parameters<typeof shell.editEntry>[2]) => shell.editEntry(e.id, () => { afterTimeChange(); onChanged(); }, focus);

  const duplicate = async (date = e.date) => {
    try {
      // The copy starts after the day's last entry, so it never overlaps the original.
      const c = await post<TimeEntry>("/time", { projectId: e.projectId, taskId: e.taskId ?? null, date, minutes: e.minutes, description: e.description, billable: e.billable, tagIds: e.tags.map((t) => t.id) });
      toast.success(date === e.date ? "Entry duplicated" : `Copied to ${fmtDate(date)}`, { description: c.startTime ? `${c.startTime}–${c.endTime}` : undefined });
      afterTimeChange();
      onChanged();
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
    <div className={`${s.entry} ${locked ? s.locked : ""}`}>
      <button type="button" className={`${s.entryDesc} ellipsis`} onClick={() => (locked ? undefined : edit("description"))} title={e.description || "No description"} disabled={locked}>
        {e.description || <span className={s.noDesc}>No description</span>}
      </button>
      <span className={s.entryProject}>
        <ProjectDot color={e.project?.color} />
        <span className="ellipsis" style={{ flexShrink: 0, maxWidth: "60%" }}>{projectPath(e.project)}</span>
        {e.task && <span className="ellipsis faint" title={e.task.title}>· {key ? `${key} ` : ""}{e.task.title}</span>}
      </span>
      <span className={s.entryTags}>
        {e.tags.map((t) => <span key={t.id} className={s.tag} title={t.name}><span className="dot" style={{ background: t.color }} />{t.name}</span>)}
      </span>
      <span className={s.entryBill}>
        <Tooltip content={e.billable ? "Billable" : "Non-billable"}>
          <DollarSign size={13} color={e.billable ? "var(--accent-text)" : "var(--border-strong)"} strokeWidth={2} aria-label={e.billable ? "Billable" : "Non-billable"} />
        </Tooltip>
      </span>
      <span className={s.entryTimes}>{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : <span className="faint">—</span>}</span>
      <span className={s.entryDur}>{hm(e.minutes, true)}</span>
      <span className={s.entryActions}>
        {locked ? <Tooltip content="This day is submitted. Reopen it to make changes."><Lock size={13} className="faint" style={{ margin: "0 7px" }} aria-label="Locked" /></Tooltip>
          : <IconButton size="sm" label="Edit entry" icon={<Pencil size={13} />} onClick={() => edit()} />}
        <Menu
          placement="bottom-end"
          trigger={<IconButton size="sm" label="Entry actions" icon={<MoreHorizontal size={14} />} />}
          items={locked ? [
            { label: "Duplicate to today", icon: <Copy size={14} />, onSelect: () => duplicate(today), disabled: e.date === today },
          ] : [
            { label: "Edit", icon: <Pencil size={14} />, onSelect: () => edit() },
            { label: "Duplicate", icon: <Copy size={14} />, onSelect: () => duplicate() },
            { type: "separator" },
            { label: "Change project or task", icon: <FolderKanban size={14} />, onSelect: () => edit("project") },
            { label: "Change date", icon: <CalendarDays size={14} />, onSelect: () => edit("date") },
            { label: "Change duration", icon: <Clock3 size={14} />, onSelect: () => edit("duration") },
            { type: "separator" },
            { label: "Delete", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirm(true) },
          ]}
        />
      </span>
      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} danger confirmLabel="Delete entry" loading={busy}
        title="Delete this time entry?" description={`${hm(e.minutes)} on ${fmtDate(e.date)}${e.description ? `: “${e.description}”` : ""}. This can't be undone.`}
      />
    </div>
  );
}
