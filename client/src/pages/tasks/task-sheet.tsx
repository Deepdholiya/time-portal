import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bell, BellOff, Copy, FileStack, Lock, MoreHorizontal, Sparkles, Trash2, Users, X } from "lucide-react";
import { AvatarGroup, Button, ConfirmDialog, Dialog, ErrorState, IconButton, Input, Menu, SkeletonRows, Tooltip, toast } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { Sheet } from "@/components/arc";
import { del, post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { fmtDateTime, relTime } from "@/lib/format";
import { useMe } from "@/lib/session";
import { patchTask, useOptions, type Impact, type TaskDetail } from "./lib";
import { SheetProperties } from "./sheet-properties";
import { Attachments, Dependencies, ImpactCallout, SubTasks, TimeSection } from "./sheet-sections";
import { ActivityFeed } from "./sheet-activity";
import s from "./task-sheet.module.css";
import "./layer-fix.css";

function AutoText({ value, onSave, className, placeholder, disabled, label }: { value: string; onSave: (v: string) => void; className: string; placeholder?: string; disabled?: boolean; label: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(value), [value]);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }, [v]);
  return (
    <textarea
      ref={ref} className={className} value={v} placeholder={placeholder} readOnly={disabled} rows={1} aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v); }}
      onKeyDown={(e) => { if (className === s.titleInput && e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
    />
  );
}

/** Global task detail panel (Linear peek): editable fields, sub-tasks, dependencies, time, files, comments and activity. */
export default function TaskSheet({ id, onClose, onOpenTask }: { id: number; onClose: () => void; onOpenTask: (id: number) => void }) {
  const { me, can } = useMe();
  const q = useApi<TaskDetail>(`/tasks/${id}`);
  const opts = useOptions();
  const t = q.data;
  const [impact, setImpact] = useState<Impact[] | null>(null);
  const impactQ = useApi<Impact[]>(t && t.blocking.length ? `/tasks/${id}/impact` : null);
  const [summary, setSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setImpact(null); setSummary(null); }, [id]);
  const shownImpact = impact ?? impactQ.data ?? [];

  const onPatch = async (body: Record<string, unknown>) => {
    if (!t) return;
    q.mutate({ ...t, ...body } as TaskDetail);
    try {
      const r = await patchTask(t.id, body);
      if ("dueDate" in body || "startDate" in body) setImpact(r.impact ?? []);
    } catch (e) {
      toast.error(e);
      q.reload();
    }
  };

  const following = !!t?.followers.some((f) => f.id === me.user.id);
  const follow = async () => {
    try { await post(`/tasks/${id}/follow`, { follow: !following }); toast.success(following ? "Unfollowed" : "You'll be notified about changes"); q.reload(); invalidate("/tasks"); } catch (e) { toast.error(e); }
  };
  const aiSummary = async () => {
    setAiBusy(true);
    try { const r = await post<{ summary: string }>("/ai/task-summary", { taskId: id }); setSummary(r.summary); } catch (e) { toast.error(e); } finally { setAiBusy(false); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/tasks/${id}`); toast.success("Link copied"); } catch { toast.error("Couldn't copy the link"); }
  };
  const saveTemplate = async () => {
    try { await post(`/tasks/${id}/template`, { name: tplName.trim() }); toast.success(`Saved template "${tplName.trim()}"`); invalidate("/options"); setTplOpen(false); } catch (e) { toast.error(e); }
  };
  const remove = async () => {
    try { await del(`/tasks/${id}`); toast.success(`Deleted ${t?.key}`); invalidate("/tasks"); invalidate("/projects"); setConfirmDelete(false); onClose(); } catch (e) { toast.error(e); }
  };
  const canDelete = !!t && (t.canManage || t.creator?.id === me.user.id);

  const header = t ? (
    <span className="row gap-4" style={{ minWidth: 0 }}>
      <ProjectDot color={t.project?.parent?.color ?? t.project?.color} />
      <span className="ellipsis muted small">{t.project?.parent ? `${t.project.parent.name} › ` : ""}{t.project?.name}</span>
      <span className="faint">›</span>
      <span className={s.headerKey}>{t.key}</span>
    </span>
  ) : "Task";

  const actions = t && (
    <>
      {can("aiAssist", "yes") && <Tooltip content="Summarize with AI"><IconButton label="AI summary" icon={<Sparkles size={15} />} loading={aiBusy} onClick={aiSummary} /></Tooltip>}
      <Tooltip content={following ? "Unfollow" : "Follow"}><IconButton label={following ? "Unfollow" : "Follow"} icon={following ? <BellOff size={15} /> : <Bell size={15} />} onClick={follow} /></Tooltip>
      <Tooltip content="Copy link"><IconButton label="Copy link" icon={<Copy size={15} />} onClick={copyLink} /></Tooltip>
      <Menu
        placement="bottom-end" width={200}
        trigger={<IconButton label="More actions" icon={<MoreHorizontal size={15} />} />}
        items={[
          can("tasks", "create") && { label: "Save as template", icon: <FileStack size={14} />, onSelect: () => { setTplName(t.title); setTplOpen(true); } },
          canDelete && { type: "separator" as const },
          canDelete && { label: "Delete task", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirmDelete(true) },
        ]}
      />
    </>
  );

  return (
    <Sheet open onClose={onClose} title={header} actions={actions} width={980}>
      {q.error && !t ? <div style={{ padding: 24 }}><ErrorState error={q.error} onRetry={q.reload} /></div> : !t ? <div style={{ padding: 16 }}><SkeletonRows rows={8} /></div> : (
        <div className={s.layout}>
          <div className={s.main}>
            <div className="col" style={{ gap: 10 }}>
              {t.parent && (
                <div className={s.crumbs}>Sub-task of <button type="button" className="link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => onOpenTask(t.parent!.id)}>{t.parent.key} {t.parent.title}</button></div>
              )}
              <AutoText className={s.titleInput} value={t.title} disabled={!t.canEdit} label="Title" onSave={(v) => v.trim() ? onPatch({ title: v.trim() }) : toast.error("Give the task a name")} />
              <AutoText className={s.descInput} value={t.description ?? ""} disabled={!t.canEdit} label="Description" placeholder={t.canEdit ? "Add a description…" : "No description"} onSave={(v) => onPatch({ description: v || null })} />
              {!t.canEdit && <div className={s.readonlyNote}><Lock size={12} />You can comment and attach files, but only the assignee or a manager can edit this task.</div>}
            </div>
            {summary && (
              <div className={s.aiBox}>
                <div className="row" style={{ marginBottom: 4 }}><Sparkles size={13} className="faint" /><span className="small muted grow">AI summary</span><IconButton size="sm" label="Close summary" icon={<X size={13} />} onClick={() => setSummary(null)} /></div>
                {summary}
              </div>
            )}
            <ImpactCallout impact={shownImpact} task={t} onShifted={() => { setImpact([]); impactQ.reload(); q.reload(); }} onDismiss={() => setImpact([])} />
            <SubTasks task={t} onOpenTask={onOpenTask} reload={q.reload} />
            <Dependencies task={t} options={opts.data} onOpenTask={onOpenTask} reload={() => { q.reload(); impactQ.reload(); }} />
            <Attachments task={t} reload={q.reload} />
            <ActivityFeed task={t} options={opts.data} reload={q.reload} />
          </div>
          <aside className={s.side}>
            <div>
              <div className={s.sideTitle}>Properties</div>
              <SheetProperties task={t} options={opts.data} onPatch={onPatch} />
            </div>
            <TimeSection task={t} reload={q.reload} />
            <div>
              <div className={s.sideTitle}><Users size={12} />Followers</div>
              <div className="row">
                {t.followers.length ? <AvatarGroup names={t.followers.map((f) => f.name)} max={6} /> : <span className="faint small">No followers</span>}
                <span className="grow" />
                <Button size="sm" variant="ghost" onClick={follow}>{following ? "Unfollow" : "Follow"}</Button>
              </div>
            </div>
            <div className="small faint col" style={{ gap: 2 }}>
              <span>Created by {t.creator?.name ?? "someone"} · <span title={fmtDateTime(String(t.createdAt))}>{relTime(String(t.createdAt))}</span></span>
              <span>Updated {relTime(String(t.updatedAt))}</span>
              {t.completedAt && <span>Completed {relTime(String(t.completedAt))}</span>}
            </div>
          </aside>
        </div>
      )}
      <Dialog
        open={tplOpen} onClose={() => setTplOpen(false)} title="Save as template" size="sm" onSubmit={saveTemplate}
        description="Saves the title, description, priority, estimate, tags and sub-tasks so you can create this task again."
        footer={<><Button variant="ghost" onClick={() => setTplOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={!tplName.trim()}>Save template</Button></>}
      >
        <Input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name" maxLength={100} />
      </Dialog>
      <ConfirmDialog
        open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} danger confirmLabel="Delete task"
        title={`Delete ${t?.key}?`} description="Its sub-tasks, comments and files are deleted too. Logged time stays in timesheets without the task link."
      />
    </Sheet>
  );
}
