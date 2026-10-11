import { useState } from "react";
import { CalendarDays, Clock3, Copy, DollarSign, FolderKanban, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, IconButton, Menu, Tooltip, toast } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { useCompanyDay } from "@/components/app/time-range";
import { del, post } from "@/lib/api";
import { addDays, fmtDate, fmtDay, hm } from "@/lib/format";
import type { DayState, Options, TimeEntry } from "@/lib/types";
import { afterTimeChange, projectPath, taskKeyOf, useDayLock } from "./time-utils";
import s from "./time.module.css";

/** "Today", "Yesterday", or "Mon 6". */
export function dayLabel(d: string, today: string) {
  if (d === today) return "Today";
  if (d === addDays(today, -1)) return "Yesterday";
  return fmtDay(d);
}

/**
 * Entries grouped by date, newest first, with a total per day. Every row uses the same column grid
 * (description, project, tags, billable, times, duration, actions) so the columns line up down the page.
 */
export function EntryList({ entries, days, options, onChanged, readOnly }: {
  entries: TimeEntry[]; days: Map<string, DayState>; options: Options | undefined; onChanged: () => void; readOnly?: boolean;
}) {
  const shell = useShell();
  const { today } = useCompanyDay();
  const isLocked = useDayLock();
  const dates = [...new Set(entries.map((e) => e.date))].sort().reverse();
  return (
    <>
      <div className={`${s.entry} ${s.entryHeader}`} aria-hidden>
        <span>Description</span><span>Project</span><span className={s.colTags}>Tags</span><span />
        <span className={`${s.colTimes} right`}>Time</span><span className="right">Duration</span><span />
      </div>
      {dates.map((d) => {
        const list = entries.filter((e) => e.date === d).sort((a, b) => (b.startTime ?? "").localeCompare(a.startTime ?? ""));
        const locked = !!readOnly || isLocked(days.get(d)?.status);
        return (
          <section key={d} aria-label={`${fmtDay(d)} entries`}>
            <div className={`${s.entry} ${s.dayHead}`}>
              <span className="row gap-4" style={{ gridColumn: "1 / -3" }}>
                <span className={d === today ? s.today : s.dayName}>{dayLabel(d, today)}</span>
                <span className="faint">{fmtDate(d)}</span>
              </span>
              <span className={s.entryDur}>{hm(list.reduce((a, e) => a + e.minutes, 0))}</span>
              <span className={s.entryActions}>
                {!locked && <IconButton size="sm" label={`Add entry on ${fmtDate(d)}`} icon={<Plus size={14} />} onClick={() => shell.logTime({ date: d }, onChanged)} />}
              </span>
            </div>
            {list.map((e) => <EntryRow key={e.id} entry={e} options={options} locked={locked} today={today} onChanged={onChanged} />)}
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
      <span className={s.entryProject} title={[projectPath(e.project), e.task?.title].filter(Boolean).join(" · ")}>
        <ProjectDot color={e.project?.color} />
        <span className={s.projText}>
          <span className="ellipsis">{projectPath(e.project)}</span>
          {e.task && <span className={`ellipsis faint ${s.taskText}`}>{key ? `${key} ` : ""}{e.task.title}</span>}
        </span>
      </span>
      <span className={`${s.entryTags} ${s.colTags}`}>
        {e.tags.map((t) => <span key={t.id} className={s.tag} title={t.name}><span className="dot" style={{ background: t.color }} />{t.name}</span>)}
      </span>
      <span className={s.entryBill}>
        <Tooltip content={e.billable ? "Billable" : "Non-billable"}>
          <DollarSign size={13} color={e.billable ? "var(--accent-text)" : "var(--border-strong)"} strokeWidth={2} aria-label={e.billable ? "Billable" : "Non-billable"} />
        </Tooltip>
      </span>
      <span className={`${s.entryTimes} ${s.colTimes}`}>{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : <span className="faint">—</span>}</span>
      <span className={s.entryDur}>{hm(e.minutes, true)}</span>
      <span className={s.entryActions}>
        {locked ? <Tooltip content="This day is approved and locked."><span className={s.lockCell}><Lock size={13} aria-label="Locked" /></span></Tooltip>
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
