import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Avatar, Button, Combobox, ConfirmDialog, DatePicker, Dialog, Field, Input, Loading, SegmentedControl, Switch, Textarea, toast, type ComboboxOption } from "@/components/arc";
import type { NewEntryDefaults } from "@/components/app/shell-context";
import { ProjectDot } from "@/components/app/icons";
import { del, get, post, put } from "@/lib/api";
import { useMe } from "@/lib/session";
import { hm, parseDuration, toMin, today } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { afterTimeChange } from "./entry-list";
import { defaultBillable, useOptions } from "./time-utils";
import s from "./time.module.css";

type Mode = "duration" | "range";

/** Global manual time entry dialog: create (with optional defaults) or edit an existing entry by id. */
export default function EntryDialog({ id, defaults, onClose, onSaved }: { id?: number; defaults?: NewEntryDefaults; onClose: () => void; onSaved?: () => void }) {
  const { me, can } = useMe();
  const { data: options } = useOptions();
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [userId, setUserId] = useState<number>(defaults?.userId ?? me.user.id);
  const [date, setDate] = useState(defaults?.date ?? today());
  const [topId, setTopId] = useState<number | null>(null);
  const [subId, setSubId] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<number | null>(defaults?.taskId ?? null);
  const [mode, setMode] = useState<Mode>("duration");
  const [duration, setDuration] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [billTouched, setBillTouched] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [initialised, setInitialised] = useState(false);

  const projects = options?.projects ?? [];
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Place a project id into the project → sub-project cascade.
  const placeProject = (pid: number | null | undefined) => {
    const p = pid ? byId.get(pid) : undefined;
    if (!p) { setTopId(null); setSubId(null); return; }
    if (p.parentId) { setTopId(p.parentId); setSubId(p.id); } else { setTopId(p.id); setSubId(null); }
  };

  // Load the entry when editing; apply defaults when creating (once options are in).
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
      if (entry.startTime && entry.endTime) { setMode("range"); setStart(entry.startTime); setEnd(entry.endTime); }
      setDuration(hm(entry.minutes, true));
      setDescription(entry.description);
      setBillable(entry.billable);
      setBillTouched(true);
    } else {
      let pid = defaults?.projectId;
      if (defaults?.taskId && !pid) pid = projects.find((p) => p.tasks.some((t) => t.id === defaults.taskId))?.id;
      placeProject(pid);
      const p = pid ? byId.get(pid) : undefined;
      if (p) setBillable(defaultBillable(p));
      const t = p?.tasks.find((x) => x.id === defaults?.taskId);
      if (t) setDescription(t.title);
    }
    setInitialised(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, entry, id, initialised]);

  const clients = new Map((options?.clients ?? []).map((c) => [c.id, c.name]));
  const loggable = (pid: number) => !!byId.get(pid)?.canLog;
  const topOptions: ComboboxOption[] = projects
    .filter((p) => !p.parentId && (p.canLog || projects.some((c) => c.parentId === p.id && c.canLog) || p.id === topId))
    .map((p) => ({ value: p.id, label: p.name, icon: <ProjectDot color={p.color} />, group: (p.clientId && clients.get(p.clientId)) || "No client", keywords: p.code ?? "" }))
    .sort((a, b) => a.group!.localeCompare(b.group!) || a.label.localeCompare(b.label));
  const children = projects.filter((p) => p.parentId === topId && (p.canLog || p.id === subId));
  const subOptions: ComboboxOption[] = children.map((p) => ({ value: p.id, label: p.name, icon: <ProjectDot color={p.color} /> }));
  const projectId = subId ?? topId;
  const project = projectId ? byId.get(projectId) : undefined;
  const taskOptions: ComboboxOption[] = (project?.tasks ?? []).map((t) => ({ value: t.id, label: t.title, hint: t.key }));
  if (entry?.task && taskId === entry.taskId && !taskOptions.some((o) => o.value === taskId)) {
    taskOptions.unshift({ value: entry.task.id, label: entry.task.title, hint: "Done" });
  }

  const forOther = id ? !!entry && entry.userId !== me.user.id : userId !== me.user.id;
  const canPickUser = !id && can("editOthersTime", "yes");
  const userOptions: ComboboxOption[] = (options?.users ?? []).map((u) => ({ value: u.id, label: u.id === me.user.id ? `${u.name} (you)` : u.name, icon: <Avatar name={u.name} size={16} />, keywords: u.email }));

  const rangeMinutes = start && end ? toMin(end) - toMin(start) : null;
  const parsed = mode === "duration" ? parseDuration(duration) : rangeMinutes;

  const pickTop = (v: string | null) => {
    const pid = v ? Number(v) : null;
    setTopId(pid);
    setSubId(null);
    setTaskId(null);
    if (pid && !billTouched) setBillable(defaultBillable(byId.get(pid)));
  };

  const save = async () => {
    setError(null);
    if (!projectId) return setError("Pick a project.");
    if (!loggable(projectId)) return setError(children.length ? "Pick a sub-project you can log time on." : "You can't log time on this project.");
    if (!description.trim()) return setError("Describe the work you did.");
    if (mode === "duration" && (!parsed || parsed <= 0)) return setError("Enter a duration like 1:30, 1.5 or 1h 30m.");
    if (mode === "range" && (!start || !end)) return setError("Enter a start and end time.");
    if (mode === "range" && (rangeMinutes ?? 0) <= 0) return setError("End time must be after start time.");
    if (parsed && parsed > 24 * 60) return setError("An entry can't be longer than 24 hours.");
    if (id && forOther && !reason.trim()) return setError("Add a reason for changing someone else's time. It's kept in the audit log.");
    const body = {
      projectId, taskId: taskId ?? null, date, description: description.trim(), billable,
      ...(mode === "range" ? { startTime: start, endTime: end, minutes: null } : { startTime: null, endTime: null, minutes: parsed }),
      ...(!id && userId !== me.user.id ? { userId } : {}),
      ...(id && forOther ? { reason: reason.trim() } : {}),
    };
    setBusy(true);
    try {
      if (id) await put(`/time/${id}`, body);
      else await post("/time", body);
      toast.success(id ? "Entry updated" : `Logged ${hm(parsed ?? 0)}`, { description: description.trim() });
      afterTimeChange();
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the entry.");
    } finally {
      setBusy(false);
    }
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

  return (
    <>
    <Dialog
      open onClose={onClose} size="md" dismissable={false}
      title={id ? "Edit time entry" : "Log time"}
      description={id && entry && forOther ? <>Editing time logged by <span className="medium">{entry.user?.name}</span></> : undefined}
      onSubmit={save}
      footer={
        <>
          {id && entry && <Button variant="danger-ghost" icon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)} style={{ marginRight: "auto" }}>Delete</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!!loading || !!loadError}>{id ? "Save changes" : "Log time"}</Button>
        </>
      }
    >
      {loadError ? <div className={s.serverError}>{loadError}</div> : loading ? <Loading /> : (
        <div className="form-grid">
          {canPickUser && (
            <Field label="Employee" className="full">
              <Combobox options={userOptions} value={userId} onChange={(v) => setUserId(v ? Number(v) : me.user.id)} searchPlaceholder="Search people…" aria-label="Employee" />
            </Field>
          )}
          <Field label="Date">
            <DatePicker value={date} onChange={(v) => v && setDate(v)} clearable={false} fullWidth aria-label="Date" />
          </Field>
          <Field label="Billable">
            <div style={{ height: 30, display: "flex", alignItems: "center" }}>
              <Switch checked={billable} onChange={(v) => { setBillable(v); setBillTouched(true); }} label={billable ? "Billable" : "Non-billable"} aria-label="Billable" />
            </div>
          </Field>
          <Field label="Project" required className={children.length ? undefined : "full"}>
            <Combobox options={topOptions} value={topId} onChange={pickTop} placeholder="Select project" searchPlaceholder="Search projects or clients…" aria-label="Project" />
          </Field>
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
          <div className="full field">
            <div className={s.modeRow}>
              <label className="field-label">Time</label>
              <SegmentedControl<Mode> aria-label="Time input" value={mode} onChange={setMode} options={[{ value: "duration", label: "Duration" }, { value: "range", label: "Start – end" }]} />
            </div>
            {mode === "duration" ? (
              <Input
                aria-label="Duration" placeholder="e.g. 1:30, 1.5 or 1h 30m" value={duration} onChange={(e) => setDuration(e.target.value)}
                invalid={!!duration && !parsed}
                suffix={parsed ? <span className="small">{hm(parsed)}</span> : undefined}
              />
            ) : (
              <div className={s.timeRow}>
                <Input type="time" aria-label="Start time" value={start} onChange={(e) => setStart(e.target.value)} />
                <Input type="time" aria-label="End time" value={end} onChange={(e) => setEnd(e.target.value)} />
                <span className="small muted" style={{ height: 30, display: "flex", alignItems: "center" }}>{rangeMinutes && rangeMinutes > 0 ? hm(rangeMinutes) : "—"}</span>
              </div>
            )}
          </div>
          <Field label="Description" required className="full">
            <Textarea aria-label="Description" placeholder="What did you work on?" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 64 }} />
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
      open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} danger loading={busy} confirmLabel="Delete"
      title="Delete this time entry?" description="This can't be undone."
    />
    </>
  );
}
