import { useEffect, useMemo, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Avatar, Button, Combobox, ConfirmDialog, DatePicker, Dialog, Field, Input, Loading, Switch, Textarea, toast, type ComboboxOption } from "@/components/ui";
import type { EntryFocus, NewEntryDefaults } from "@/components/app/shell-context";
import { useCompanyDay } from "@/components/app/time-range";
import { ProjectDot } from "@/components/app/icons";
import { del, get, post, put } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { fromMin, hm, parseDuration, toMin } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { afterTimeChange, defaultBillable, tagOptions, useOptions, useTags } from "./time-utils";
import s from "./time.module.css";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The one time entry editor, used by the Time tracker, the Timesheet and anywhere else time is logged.
 * Duration and start give the end time; changing the end changes the duration. Description and tags can be filled in later,
 * the company's rules are checked when the day is submitted.
 */
export default function EntryDialog({ id, defaults, focus, onClose, onSaved }: { id?: number; defaults?: NewEntryDefaults; focus?: EntryFocus; onClose: () => void; onSaved?: () => void }) {
  const { me, can, settings } = useMe();
  const { today } = useCompanyDay();
  const { data: options } = useOptions();
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [userId, setUserId] = useState<number>(defaults?.userId ?? me.user.id);
  const [date, setDate] = useState(defaults?.date && defaults.date <= today ? defaults.date : today);
  const [topId, setTopId] = useState<number | null>(null);
  const [subId, setSubId] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<number | null>(defaults?.taskId ?? null);
  const [duration, setDuration] = useState(defaults?.minutes ? hm(defaults.minutes) : "");
  const [start, setStart] = useState("");
  const [startTouched, setStartTouched] = useState(false);
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [billable, setBillable] = useState(defaults?.billable ?? true);
  const [billTouched, setBillTouched] = useState(defaults?.billable !== undefined);
  const [tagIds, setTagIds] = useState<number[]>(defaults?.tagIds ?? []);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [initialised, setInitialised] = useState(false);

  const projects = options?.projects ?? [];
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const tags = useTags(userId !== me.user.id ? userId : undefined);
  // The day's other entries, so a new entry starts where the last one ended.
  const sameDay = useApi<TimeEntry[]>("/time", { from: date, to: date, userId: userId !== me.user.id ? userId : undefined });

  const placeProject = (pid: number | null | undefined) => {
    const p = pid ? byId.get(pid) : undefined;
    if (!p) { setTopId(null); setSubId(null); return; }
    if (p.parentId) { setTopId(p.parentId); setSubId(p.id); } else { setTopId(p.id); setSubId(null); }
  };

  useEffect(() => {
    if (!id) return;
    get<TimeEntry>(`/time/entry/${id}`).then(setEntry).catch((e) => setLoadError(e.message));
  }, [id]);

  useEffect(() => {
    if (initialised || !options) return;
    if (id) {
      if (!entry) return;
      setUserId(entry.userId);
      setDate(entry.date);
      placeProject(entry.projectId);
      setTaskId(entry.taskId ?? null);
      setDuration(hm(entry.minutes));
      if (entry.startTime) { setStart(entry.startTime); setStartTouched(true); }
      if (entry.endTime) setEnd(entry.endTime);
      setDescription(entry.description);
      setBillable(entry.billable);
      setBillTouched(true);
      setTagIds(entry.tags.map((t) => t.id));
    } else {
      let pid = defaults?.projectId;
      if (defaults?.taskId && !pid) pid = projects.find((p) => p.tasks.some((t) => t.id === defaults.taskId))?.id;
      placeProject(pid);
      const p = pid ? byId.get(pid) : undefined;
      if (p && defaults?.billable === undefined) setBillable(defaultBillable(p));
      const t = p?.tasks.find((x) => x.id === defaults?.taskId);
      if (t && !defaults?.description) setDescription(t.title);
    }
    setInitialised(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, entry, id, initialised]);

  // Focus the field a "Change …" shortcut asked for.
  useEffect(() => {
    if (!initialised || !focus) return;
    const t = setTimeout(() => document.querySelector<HTMLElement>(`[data-entry-focus="${focus}"] button, [data-entry-focus="${focus}"] input, [data-entry-focus="${focus}"] textarea`)?.focus(), 80);
    return () => clearTimeout(t);
  }, [initialised, focus]);

  const minutes = parseDuration(duration);
  // A new entry starts after the day's last entry, or at the start of the working day.
  const suggestedStart = useMemo(() => {
    const others = (sameDay.data ?? []).filter((e) => e.id !== id && e.endTime);
    const last = others.map((e) => e.endTime!).sort().at(-1);
    return last ?? settings.workdayStart ?? "09:00";
  }, [sameDay.data, id, settings.workdayStart]);
  const effectiveStart = startTouched ? start : suggestedStart;
  const computedEnd = TIME.test(effectiveStart) && minutes ? toMin(effectiveStart) + minutes : null;
  useEffect(() => {
    if (!initialised) return;
    if (computedEnd !== null && computedEnd <= 24 * 60) setEnd(fromMin(computedEnd === 24 * 60 ? 24 * 60 - 1 : computedEnd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedEnd, initialised]);

  const changeEnd = (v: string) => {
    setEnd(v);
    if (TIME.test(v) && TIME.test(effectiveStart)) {
      const m = toMin(v) - toMin(effectiveStart);
      if (m > 0) setDuration(hm(m));
    }
  };

  const clients = new Map((options?.clients ?? []).map((c) => [c.id, c.name]));
  const loggable = (pid: number) => !!byId.get(pid)?.canLog;
  const topOptions: ComboboxOption[] = projects
    .filter((p) => !p.parentId && (p.canLog || projects.some((c) => c.parentId === p.id && c.canLog) || p.id === topId))
    .map((p) => ({ value: p.id, label: p.name, icon: <ProjectDot color={p.color} />, group: (p.clientId && clients.get(p.clientId)) || "No client", keywords: p.code ?? "" }))
    .sort((a, b) => a.group!.localeCompare(b.group!) || a.label.localeCompare(b.label));
  const children = topId ? projects.filter((p) => p.parentId === topId && (p.canLog || p.id === subId)) : [];
  const subOptions: ComboboxOption[] = children.map((p) => ({ value: p.id, label: p.name, icon: <ProjectDot color={p.color} /> }));
  const projectId = subId ?? topId;
  const project = projectId ? byId.get(projectId) : undefined;
  const taskOptions: ComboboxOption[] = (project?.tasks ?? []).map((t) => ({ value: t.id, label: t.title, hint: t.key }));
  if (entry?.task && taskId === entry.taskId && !taskOptions.some((o) => o.value === taskId)) taskOptions.unshift({ value: entry.task.id, label: entry.task.title, hint: "Done" });

  const forOther = id ? !!entry && entry.userId !== me.user.id : userId !== me.user.id;
  const canPickUser = !id && can("editOthersTime", "yes");
  const userOptions: ComboboxOption[] = (options?.users ?? []).map((u) => ({ value: u.id, label: u.id === me.user.id ? `${u.name} (you)` : u.name, icon: <Avatar name={u.name} size={16} />, keywords: u.email }));

  const pickTop = (v: string | null) => {
    const pid = v ? Number(v) : null;
    setTopId(pid);
    setSubId(null);
    setTaskId(null); // a task belongs to one project, so changing the project clears it
    if (pid && !billTouched) setBillable(defaultBillable(byId.get(pid)));
  };

  const durationError = duration && !minutes ? "Use a duration like 5h, 2h 30m, 45m or 1:30" : minutes && minutes > 24 * 60 ? "An entry can't be longer than 24 hours" : null;
  const startError = startTouched && start && !TIME.test(start) ? "Use HH:MM" : computedEnd !== null && computedEnd > 24 * 60 ? "This runs past midnight. Pick an earlier start or a shorter duration." : null;

  const save = async (keepOpen = false) => {
    setError(null);
    if (!projectId) return setError("Pick a project.");
    if (!loggable(projectId)) return setError(children.length ? "Pick a sub-project you can log time on." : "You can't log time on this project.");
    if (!minutes || durationError) return setError(durationError ?? "Enter how long you worked, like 1h 30m.");
    if (startError) return setError(startError);
    if (date > today) return setError("You can't log time on a future date.");
    if (id && forOther && !reason.trim()) return setError("Add a reason for changing someone else's time. It's kept in the audit log.");
    const body = {
      projectId, taskId: taskId ?? null, date, description: description.trim(), billable: settings.billableEnabled === false ? false : billable, tagIds,
      startTime: startTouched && start ? start : id ? effectiveStart : null, endTime: null, minutes,
      ...(!id && userId !== me.user.id ? { userId } : {}),
      ...(id && forOther ? { reason: reason.trim() } : {}),
    };
    setBusy(true);
    try {
      const saved = id ? await put<TimeEntry>(`/time/${id}`, body) : await post<TimeEntry>("/time", body);
      toast.success(id ? "Entry saved" : `Logged ${hm(saved.minutes)}`, { description: saved.startTime && saved.endTime ? `${saved.startTime}–${saved.endTime}${saved.description ? ` · ${saved.description}` : ""}` : saved.description || undefined });
      afterTimeChange();
      onSaved?.();
      if (keepOpen) { setDescription(""); setDuration(""); setStart(""); setStartTouched(false); sameDay.reload(); }
      else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the entry.");
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      // The copy starts after the day's last entry so it never overlaps the original.
      const copy = await post<TimeEntry>("/time", { projectId: entry.projectId, taskId: entry.taskId ?? null, date: entry.date, minutes: entry.minutes, description: entry.description, billable: entry.billable, tagIds: entry.tags.map((t) => t.id), ...(forOther ? { userId: entry.userId } : {}) });
      toast.success("Entry duplicated", { description: copy.startTime ? `${copy.startTime}–${copy.endTime}` : undefined });
      afterTimeChange();
      onSaved?.();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't duplicate the entry."); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!id) return;
    if (forOther && !reason.trim()) { setConfirmDelete(false); return setError("Add a reason before deleting someone else's time."); }
    setBusy(true);
    try {
      await del(`/time/${id}${forOther ? `?reason=${encodeURIComponent(reason.trim())}` : ""}`);
      toast.success("Entry deleted");
      afterTimeChange();
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the entry.");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const loading = !options || (id && !entry && !loadError);
  const keep = entry?.tags ?? [];

  return (
    <>
    <Dialog
      open onClose={onClose} size="md" dismissable={false}
      title={id ? "Edit time entry" : "Log time"}
      description={id && entry && forOther ? <>Editing time logged by <span className="medium">{entry.user?.name}</span></> : undefined}
      onSubmit={() => save()}
      footer={
        <>
          {id && entry && (
            <div className="row gap-4" style={{ marginRight: "auto" }}>
              <Button variant="danger-ghost" icon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)}>Delete</Button>
              <Button variant="ghost" icon={<Copy size={14} />} onClick={duplicate} disabled={busy}>Duplicate</Button>
            </div>
          )}
          {!id && <Button variant="ghost" onClick={() => save(true)} disabled={busy || !!loading} style={{ marginRight: "auto" }}>Save and add another</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!!loading || !!loadError}>{id ? "Save" : "Log time"}</Button>
        </>
      }
    >
      {loadError ? <div className={s.serverError}>{loadError}</div> : loading ? <Loading /> : (
        <div className="form-grid">
          {canPickUser && (
            <Field label="Employee" className="full">
              <Combobox options={userOptions} value={userId} onChange={(v) => { setUserId(v ? Number(v) : me.user.id); setTagIds([]); }} searchPlaceholder="Search people…" aria-label="Employee" />
            </Field>
          )}
          <div data-entry-focus="date">
            <Field label="Date" required>
              <DatePicker value={date} max={today} onChange={(v) => v && setDate(v > today ? today : v)} clearable={false} fullWidth aria-label="Date" />
            </Field>
          </div>
          {settings.billableEnabled !== false ? (
            <Field label="Billable">
              <div style={{ height: 30, display: "flex", alignItems: "center" }}>
                <Switch checked={billable} onChange={(v) => { setBillable(v); setBillTouched(true); }} label={billable ? "Billable" : "Non-billable"} aria-label="Billable" />
              </div>
            </Field>
          ) : <div />}
          <div data-entry-focus="project" className={children.length ? undefined : "full"}>
            <Field label="Project" required>
              <Combobox options={topOptions} value={topId} onChange={pickTop} placeholder="Select project" searchPlaceholder="Search projects or clients…" aria-label="Project" />
            </Field>
          </div>
          {children.length > 0 && (
            <Field label="Sub-project">
              <Combobox
                options={subOptions} value={subId} clearable clearLabel={byId.get(topId!)?.canLog ? "No sub-project" : "Select a sub-project"}
                onChange={(v) => { setSubId(v ? Number(v) : null); setTaskId(null); }} placeholder={byId.get(topId!)?.canLog ? "Optional" : "Select sub-project"} aria-label="Sub-project"
              />
            </Field>
          )}
          <Field label="Task" className="full">
            <Combobox
              options={taskOptions} value={taskId} clearable clearLabel="No task"
              onChange={(v) => {
                const t = v ? Number(v) : null;
                setTaskId(t);
                const title = project?.tasks.find((x) => x.id === t)?.title;
                if (title && !description.trim()) setDescription(title);
              }}
              placeholder={project ? (taskOptions.length ? "Optional" : "No open tasks") : "Pick a project first"} disabled={!project} aria-label="Task"
            />
          </Field>
          <div className={`full ${s.timeRow}`} data-entry-focus="duration">
            <Field label="Duration" required error={durationError ?? undefined} hint={!durationError ? "5h, 2h 30m, 45m or 1:30" : undefined}>
              <Input aria-label="Duration" placeholder="e.g. 1h 30m" value={duration} onChange={(e) => setDuration(e.target.value)} onBlur={() => minutes && !durationError && setDuration(hm(minutes))} invalid={!!durationError} />
            </Field>
            <Field label="Start" error={startError ?? undefined} hint={!startTouched ? "After your last entry" : undefined}>
              <Input type="time" aria-label="Start time" value={effectiveStart} onChange={(e) => { setStart(e.target.value); setStartTouched(true); }} invalid={!!startError} />
            </Field>
            <Field label="End" hint="Set by the duration">
              <Input type="time" aria-label="End time" value={end} onChange={(e) => changeEnd(e.target.value)} />
            </Field>
          </div>
          <div className="full" data-entry-focus="description">
            <Field label="Description" hint={settings.requireDescription !== false ? "Needed before the day is submitted" : undefined}>
              <Textarea aria-label="Description" placeholder="What did you work on?" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 64 }} />
            </Field>
          </div>
          <Field label="Tags" className="full" hint={settings.requireTags ? "At least one tag is needed before the day is submitted" : "Only tags your team can use are listed"}>
            <Combobox multiple options={tagOptions(tags.data, keep)} value={tagIds} onChange={(v) => setTagIds(v.map(Number))} placeholder="Add tags" aria-label="Tags" />
          </Field>
          {id && forOther && (
            <div className={`full ${s.reason}`}>
              <div className="small">You're changing {entry?.user?.name ?? "someone else"}'s time. The old and new values and your reason are recorded in the audit log.</div>
              <Input aria-label="Reason for the change" placeholder="Reason for the change (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {error && <div className={`full ${s.serverError}`} role="alert">{error}</div>}
        </div>
      )}
    </Dialog>
    {/* Outside the dialog's form: React events bubble through portals, so a nested confirm would also submit the entry form. */}
    <ConfirmDialog
      open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} danger loading={busy} confirmLabel="Delete entry"
      title="Delete this time entry?" description={entry ? `${hm(entry.minutes)} on ${entry.date}${entry.description ? `: “${entry.description}”` : ""}. This can't be undone.` : "This can't be undone."}
    />
    </>
  );
}
