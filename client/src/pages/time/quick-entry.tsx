import { useMemo, useRef, useState } from "react";
import { DollarSign, Plus, Tag as TagIcon } from "lucide-react";
import { Button, Combobox, DatePicker, IconButton, Tooltip, toast } from "@/components/ui";
import { useCompanyDay } from "@/components/app/time-range";
import { post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { fmtDate, fromMin, hm, parseDuration, toMin } from "@/lib/format";
import type { Options, TimeEntry } from "@/lib/types";
import { ProjectTaskPicker, type Pick } from "./project-task-picker";
import { afterTimeChange, defaultBillable, tagOptions, useTags } from "./time-utils";
import s from "./time.module.css";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Manual entry bar at the top of the Time tracker: what, where, when and how long. The start defaults to the end of the day's
 * last entry; the end follows from the duration.
 */
export function QuickEntry({ options, onAdded }: { options: Options | undefined; onAdded: () => void }) {
  const { settings } = useMe();
  const { today } = useCompanyDay();
  const [desc, setDesc] = useState("");
  const [pick, setPick] = useState<Pick>({ projectId: null, taskId: null });
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [billable, setBillable] = useState(true);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const tags = useTags();
  const dayEntries = useApi<TimeEntry[]>("/time", { from: date, to: date });

  const suggested = useMemo(() => (dayEntries.data ?? []).map((e) => e.endTime).filter(Boolean).sort().at(-1) ?? settings.workdayStart ?? "09:00", [dayEntries.data, settings.workdayStart]);
  const startValue = start || suggested;
  const minutes = parseDuration(duration);
  const end = minutes && TIME.test(startValue) ? toMin(startValue) + minutes : null;

  const add = async () => {
    setError(null);
    if (!pick.projectId) return setError("Pick a project or task.");
    if (!minutes) return setError(duration ? "Use a duration like 5h, 2h 30m or 45m." : "Enter how long you worked.");
    if (end !== null && end > 24 * 60) return setError("That runs past midnight. Pick an earlier start or a shorter duration.");
    setBusy(true);
    try {
      const e = await post<TimeEntry>("/time", {
        projectId: pick.projectId, taskId: pick.taskId, date, minutes, description: desc.trim(), tagIds,
        billable: settings.billableEnabled === false ? false : billable, startTime: start || null,
      });
      toast.success(`Logged ${hm(e.minutes)}${date !== today ? ` on ${fmtDate(date)}` : ""}`, { description: e.startTime ? `${e.startTime}–${e.endTime}${e.description ? ` · ${e.description}` : ""}` : e.description || undefined });
      setDesc(""); setDuration(""); setStart("");
      afterTimeChange();
      dayEntries.reload();
      onAdded();
      descRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the entry.");
    } finally {
      setBusy(false);
    }
  };

  const tagOpts = tagOptions(tags.data);
  const selectedTags = tagOpts.filter((o) => tagIds.includes(Number(o.value)));
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); add(); } };

  return (
    <div className={s.quickWrap}>
      <form className={s.bar} onSubmit={(e) => { e.preventDefault(); add(); }} aria-label="Log time">
        <input ref={descRef} className={s.barInput} placeholder="What did you work on?" value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={onEnter} aria-label="Description" />
        <ProjectTaskPicker
          options={options} value={pick} width={400} placeholder="Project or task"
          onChange={(v) => { setPick(v); const p = options?.projects.find((x) => x.id === v.projectId); if (p) setBillable(defaultBillable(p)); const t = p?.tasks.find((x) => x.id === v.taskId); if (t && !desc.trim()) setDesc(t.title); }}
        />
        <Combobox
          multiple options={tagOpts} value={tagIds} onChange={(v) => setTagIds(v.map(Number))} width={240} searchPlaceholder="Search tags…" emptyText="No tags for your team"
          trigger={
            <button type="button" className={s.pickTrigger} aria-label="Tags">
              <TagIcon size={14} className={selectedTags.length ? undefined : "faint"} />
              {selectedTags.length ? <span className="ellipsis">{selectedTags.map((t) => t.label).join(", ")}</span> : <span className="faint">Tags</span>}
            </button>
          }
        />
        {settings.billableEnabled !== false && (
          <Tooltip content={billable ? "Billable" : "Non-billable"}>
            <IconButton size="sm" label={billable ? "Billable: click to make non-billable" : "Non-billable: click to make billable"} className={`${s.billBtn} ${billable ? s.on : ""}`} icon={<DollarSign size={15} />} onClick={() => setBillable((b) => !b)} />
          </Tooltip>
        )}
        <span className={s.sep} />
        <DatePicker
          value={date} max={today} clearable={false} size="sm" onChange={(v) => v && setDate(v > today ? today : v)}
          trigger={<button type="button" className={s.pickTrigger} aria-label="Date"><span className="num">{date === today ? "Today" : fmtDate(date)}</span></button>}
        />
        <label className={s.timeBox} title="Start time">
          <span className="sr-only">Start time</span>
          <input type="time" value={startValue} onChange={(e) => setStart(e.target.value)} aria-label="Start time" />
        </label>
        <span className={s.arrow} aria-hidden="true">→</span>
        <span className={`${s.endTime} num`} aria-label="End time" title="End time, set by the duration">{end !== null && end <= 24 * 60 ? fromMin(Math.min(end, 24 * 60 - 1)) : "--:--"}</span>
        <input className={`${s.durInput} num`} placeholder="1h 30m" value={duration} onChange={(e) => setDuration(e.target.value)} onKeyDown={onEnter} aria-label="Duration" aria-invalid={!!duration && !minutes} />
        <Button type="submit" variant="primary" icon={<Plus size={14} />} loading={busy}>Add</Button>
      </form>
      {error && <div className={s.barError} role="alert">{error}</div>}
    </div>
  );
}
