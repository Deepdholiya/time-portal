import { useRef, useState } from "react";
import { AlertTriangle, Download, FileText, Image as ImageIcon, Link2, Play, Plus, Timer, Trash2, Upload, X } from "lucide-react";
import { Avatar, Button, Combobox, ConfirmDialog, IconButton, Spinner, toast } from "@/components/ui";
import { StatusIcon } from "@/components/app/icons";
import { StatusPicker } from "@/components/app/properties";
import { useShell } from "@/components/app/shell-context";
import { timerActions, useRunningTimer } from "@/components/app/timer-widget";
import { del, post, upload } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { fmtDate, hm, relTime } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Options, TaskStatus } from "@/lib/types";
import { fmtSize, patchTask, type Impact, type TaskDetail } from "./lib";
import s from "./task-sheet.module.css";

export function SectionHead({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return <div className={s.sectionHead}><span>{title}</span>{count !== undefined && <span className={s.count}>{count}</span>}<span className="grow" />{action}</div>;
}

export function SubTasks({ task, onOpenTask, reload }: { task: TaskDetail; onOpenTask: (id: number) => void; reload: () => void }) {
  const { can } = useMe();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = can("tasks", "create");
  const done = task.subtasks.filter((t) => t.status === "DONE").length;

  const add = async () => {
    if (!title.trim()) { setAdding(false); return; }
    setBusy(true);
    try {
      await post("/tasks", { title: title.trim(), projectId: task.projectId, parentId: task.id, ...(task.canManage ? { assigneeId: task.assignee?.id ?? null } : {}) });
      setTitle("");
      invalidate("/tasks");
      reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const setStatus = async (id: number, status: TaskStatus) => {
    try { await patchTask(id, { status }); reload(); } catch (e) { toast.error(e); }
  };

  if (!task.subtasks.length && !canAdd) return null;
  return (
    <div className={s.section}>
      <SectionHead
        title="Sub-tasks"
        action={<>
          {task.subtasks.length > 0 && <span className="small faint num">{done}/{task.subtasks.length} done</span>}
          {canAdd && task.subtasks.length > 0 && <IconButton size="sm" label="Add sub-task" icon={<Plus size={14} />} onClick={() => setAdding(true)} />}
        </>}
      />
      {task.subtasks.map((t) => (
        <div key={t.id} className={s.subRow} onClick={() => onOpenTask(t.id)}>
          <span onClick={(e) => e.stopPropagation()}><StatusPicker value={t.status} onChange={(v) => setStatus(t.id, v)} /></span>
          <span className="key">{t.key}</span>
          <span className={`ellipsis grow ${t.status === "DONE" ? s.subDone : ""}`}>{t.title}</span>
          {t.dueDate && <span className={`small ${t.overdue ? "danger" : "faint"}`}>{fmtDate(t.dueDate)}</span>}
          <Avatar name={t.assignee?.name} size={18} />
        </div>
      ))}
      {adding ? (
        <div className={s.addRow}>
          <StatusIcon status="TODO" />
          <input
            autoFocus className={s.inlineInput} placeholder="Sub-task title, Enter to add" value={title} disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") { e.stopPropagation(); setAdding(false); setTitle(""); } }}
            onBlur={() => { if (!title.trim()) setAdding(false); }}
          />
          {busy && <Spinner />}
        </div>
      ) : !task.subtasks.length && canAdd ? (
        <button type="button" className={`${s.addRow} prop-chip faint`} style={{ width: "fit-content" }} onClick={() => setAdding(true)}><Plus size={13} />Add sub-task</button>
      ) : null}
    </div>
  );
}

export function ImpactCallout({ impact, task, onShifted, onDismiss }: { impact: Impact[]; task: TaskDetail; onShifted: () => void; onDismiss: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!impact.length) return null;
  const shift = async () => {
    setBusy(true);
    try {
      const r = await post<{ moved: number }>(`/tasks/${task.id}/shift-dependents`);
      toast.success(r.moved ? `Moved ${r.moved} dependent task${r.moved > 1 ? "s" : ""} after ${task.key}` : "Nothing needed to move");
      invalidate("/tasks");
      invalidate("/projects");
      onShifted();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <div className={s.callout} role="status">
      <div className={s.calloutHead}>
        <AlertTriangle size={15} />
        <span className="grow">{impact.length > 1 ? `${impact.length} dependent tasks now start` : "1 dependent task now starts"} before {task.key} is due</span>
        <IconButton size="sm" label="Dismiss" icon={<X size={14} />} onClick={onDismiss} />
      </div>
      <ul className={s.calloutList}>
        {impact.map((i) => <li key={i.id}><b className="medium">{i.key}</b> {i.title}: {i.reason}</li>)}
      </ul>
      {task.canManage && (
        <div className="row">
          <Button size="sm" variant="primary" loading={busy} onClick={shift}>Shift dependents</Button>
          <span className="small muted">Moves each one to start the day after its latest blocker, keeping its duration.</span>
        </div>
      )}
    </div>
  );
}

export function Dependencies({ task, options, onOpenTask, reload }: { task: TaskDetail; options?: Options; onOpenTask: (id: number) => void; reload: () => void }) {
  const mgr = task.canManage;
  if (!mgr && !task.blockedBy.length && !task.blocking.length) return null;
  const linked = new Set([task.id, ...task.blockedBy.map((b) => b.id), ...task.blocking.map((b) => b.id)]);
  const candidates = (options?.projects ?? []).flatMap((p) => p.tasks.map((t) => ({ ...t, project: p.name }))).filter((t) => !linked.has(t.id));
  const opts = candidates.map((t) => ({ value: t.id, label: `${t.key ?? ""} ${t.title}`, hint: t.project }));

  const add = async (body: { blockerId?: number; blockedId?: number }) => {
    try { await post(`/tasks/${task.id}/dependencies`, body); invalidate("/tasks"); reload(); toast.success("Dependency added"); } catch (e) { toast.error(e); }
  };
  const remove = async (blockerId: number, blockedId: number) => {
    try { await del(`/tasks/${task.id}/dependencies/${blockerId}/${blockedId}`); invalidate("/tasks"); reload(); } catch (e) { toast.error(e); }
  };

  const row = (d: { id: number; key: string; title: string; status: TaskStatus; dueDate?: string | null }, onRemove: () => void) => (
    <div key={d.id} className={s.subRow} onClick={() => onOpenTask(d.id)}>
      <StatusIcon status={d.status} />
      <span className="key">{d.key}</span>
      <span className={`ellipsis grow ${d.status === "DONE" ? s.subDone : ""}`}>{d.title}</span>
      {d.dueDate && <span className="small faint">due {fmtDate(d.dueDate)}</span>}
      {mgr && <span onClick={(e) => e.stopPropagation()}><IconButton size="sm" label="Remove dependency" icon={<X size={13} />} onClick={onRemove} /></span>}
    </div>
  );

  return (
    <div className={s.section}>
      <SectionHead
        title="Dependencies"
        action={mgr && <>
          <Combobox value={null} options={opts} width={340} searchPlaceholder="Blocked by…" emptyText="No open tasks" onChange={(v) => v && add({ blockerId: Number(v) })}
            trigger={<Button size="sm" variant="ghost" icon={<Link2 size={13} />}>Blocked by</Button>} />
          <Combobox value={null} options={opts} width={340} searchPlaceholder="Blocking…" emptyText="No open tasks" onChange={(v) => v && add({ blockedId: Number(v) })}
            trigger={<Button size="sm" variant="ghost" icon={<Link2 size={13} />}>Blocking</Button>} />
        </>}
      />
      {task.conflict && <div className="small warn row gap-4"><AlertTriangle size={13} />Starts before a blocker is due</div>}
      {task.blockedBy.length > 0 && <div className={s.depGroup}>Blocked by</div>}
      {task.blockedBy.map((b) => row(b, () => remove(b.id, task.id)))}
      {task.blocking.length > 0 && <div className={s.depGroup}>Blocking</div>}
      {task.blocking.map((b) => row(b, () => remove(task.id, b.id)))}
      {!task.blockedBy.length && !task.blocking.length && <div className="small faint" style={{ padding: "2px 6px" }}>No dependencies</div>}
    </div>
  );
}

/** Tracked vs estimate, linked time entries, and timer / log-time actions that keep the task link. */
export function TimeSection({ task, reload }: { task: TaskDetail; reload: () => void }) {
  const shell = useShell();
  const running = useRunningTimer();
  const [starting, setStarting] = useState(false);
  const est = task.estimateHours ?? 0;
  const pct = est ? Math.min(1, task.trackedMinutes / 60 / est) : 0;
  const over = est > 0 && task.trackedMinutes / 60 > est;
  const onThis = running.data?.taskId === task.id;
  const start = async () => {
    setStarting(true);
    try { await timerActions.start({ taskId: task.id, projectId: task.projectId }); toast.success(`Timer started on ${task.key}`); } catch (e) { toast.error(e); } finally { setStarting(false); }
  };
  return (
    <div className={s.timeBox}>
      <div className={s.sideTitle}><Timer size={12} />Time</div>
      <div className={s.timeNums}>
        <span className={s.timeBig}>{hm(task.trackedMinutes)}</span>
        <span className="small muted">{est ? `of ${est}h estimate` : "tracked"}</span>
      </div>
      {est > 0 && <div className="progress"><span style={{ width: `${pct * 100}%`, background: over ? "var(--red)" : undefined }} /></div>}
      {over && <span className="small danger">{hm(task.trackedMinutes - est * 60)} over estimate</span>}
      <div className="row gap-4">
        {onThis ? (
          <Button size="sm" variant="secondary" icon={<span className="dot" style={{ background: "var(--red)" }} />} onClick={async () => { try { await timerActions.stop(); reload(); } catch (e) { toast.error(e); } }}>Stop timer</Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<Play size={13} />} loading={starting} onClick={start}>Start timer</Button>
        )}
        <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => shell.logTime({ taskId: task.id, projectId: task.projectId }, () => { invalidate("/tasks"); reload(); })}>Log time</Button>
      </div>
      {task.timeEntries.length > 0 && (
        <div className="col" style={{ gap: 0 }}>
          {task.timeEntries.slice(0, 8).map((e) => (
            <div key={e.id} className={s.entry} onClick={() => shell.editEntry(e.id, () => { invalidate("/tasks"); reload(); })} title={e.description}>
              <Avatar name={e.user?.name} size={18} />
              <span className="ellipsis"><span className="muted">{fmtDate(e.date)}</span> {e.description}</span>
              <span className="num medium">{hm(e.minutes)}</span>
            </div>
          ))}
          {task.timeEntries.length > 8 && <span className="small faint" style={{ padding: "4px 6px" }}>+{task.timeEntries.length - 8} more entries</span>}
        </div>
      )}
    </div>
  );
}

function saveFile(id: number, name: string) {
  const a = document.createElement("a");
  a.href = `/api/tasks/attachments/${id}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function Attachments({ task, reload }: { task: TaskDetail; reload: () => void }) {
  const { me } = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);

  const send = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    const fd = new FormData();
    list.slice(0, 5).forEach((f) => fd.append("files", f));
    setBusy(true);
    try {
      await upload(`/tasks/${task.id}/attachments`, fd);
      toast.success(list.length > 1 ? `Uploaded ${list.length} files` : `Uploaded ${list[0].name}`);
      invalidate("/tasks");
      reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  return (
    <div className={s.section}>
      <SectionHead
        title="Attachments" count={task.attachments.length || undefined}
        action={<Button size="sm" variant="ghost" icon={<Upload size={13} />} loading={busy} onClick={() => input.current?.click()}>Upload</Button>}
      />
      <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && send(e.target.files)} />
      {task.attachments.map((a) => (
        <div key={a.id} className={s.file}>
          <span className={s.fileIcon}>{a.mime.startsWith("image/") ? <ImageIcon size={13} /> : <FileText size={13} />}</span>
          <a className="ellipsis grow link" href={`/api/tasks/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">{a.name}</a>
          <span className="small faint hide-sm">{fmtSize(a.size)} · {a.user.name} · {relTime(a.createdAt)}</span>
          <IconButton size="sm" label={`Download ${a.name}`} icon={<Download size={13} />} onClick={() => saveFile(a.id, a.name)} />
          {(a.user.id === me.user.id || task.canManage) && <IconButton size="sm" label={`Remove ${a.name}`} icon={<Trash2 size={13} />} onClick={() => setRemoving(a)} />}
        </div>
      ))}
      <div
        className={`${s.drop} ${over ? s.over : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
      >
        Drop files here (images, PDF, Office, text, zip · up to 10 MB)
      </div>
      <ConfirmDialog
        open={!!removing} onClose={() => setRemoving(null)} danger confirmLabel="Remove" title={`Remove ${removing?.name}?`} description="The file is deleted for everyone on this task."
        onConfirm={async () => {
          try { await del(`/tasks/attachments/${removing!.id}`); toast.success("File removed"); invalidate("/tasks"); reload(); } catch (e) { toast.error(e); }
          setRemoving(null);
        }}
      />
    </div>
  );
}
