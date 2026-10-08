import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, ExternalLink, FileText, Image as ImageIcon, Link2, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Avatar, Badge, Button, Checkbox, Combobox, ConfirmDialog, DatePicker, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Menu, Select, SkeletonRows, Textarea, toast } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { del, get, post, put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime, relTime, today } from "@/lib/format";
import { useMe } from "@/lib/session";
import { fmtSize, useOptions } from "../tasks/lib";
import { PROJECT_STATUS, type ChildProject, type Links, type MilestoneRow, type ProjectDetail } from "./lib";
import { ProjectFormDialog } from "./project-form";
import s from "./projects.module.css";
import "../tasks/layer-fix.css";

const refresh = () => { invalidate("/projects"); invalidate("/options"); };

// ---------- Milestones ----------
function MilestoneDialog({ project, m, onClose }: { project: ProjectDetail; m?: MilestoneRow; onClose: () => void }) {
  const [f, setF] = useState({ name: m?.name ?? "", date: m?.date ?? today(), description: m?.description ?? "", projectId: m?.projectId ?? project.id });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.name.trim()) return toast.error("Give the milestone a name");
    setBusy(true);
    try {
      const body = { name: f.name.trim(), date: f.date, description: f.description.trim() || null, projectId: f.projectId };
      if (m) await put(`/projects/milestones/${m.id}`, body); else await post(`/projects/${project.id}/milestones`, body);
      toast.success(m ? "Milestone saved" : "Milestone added");
      refresh(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={m ? "Edit milestone" : "New milestone"} size="sm" onSubmit={submit}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{m ? "Save" : "Add milestone"}</Button></>}>
      <div className="col" style={{ gap: 12 }}>
        <Field label="Name" required><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Beta launch" /></Field>
        <Field label="Date" required><DatePicker value={f.date} clearable={false} fullWidth onChange={(v) => v && setF({ ...f, date: v })} /></Field>
        {project.children.length > 0 && !m && (
          <Field label="Belongs to"><Select value={f.projectId} onChange={(v) => setF({ ...f, projectId: Number(v) })} options={[{ value: project.id, label: project.name }, ...project.children.map((c) => ({ value: c.id, label: `› ${c.name}` }))]} /></Field>
        )}
        <Field label="Description"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

export function Milestones({ p, manage, onChanged }: { p: ProjectDetail; manage: boolean; onChanged: () => void }) {
  const { can } = useMe();
  const canEdit = manage || can("roadmap", "edit");
  const [editing, setEditing] = useState<MilestoneRow | "new" | null>(null);
  const [removing, setRemoving] = useState<MilestoneRow | null>(null);
  const t0 = today();
  const toggle = async (m: MilestoneRow) => {
    try { await put(`/projects/milestones/${m.id}`, { done: !m.done }); toast.success(m.done ? "Marked not done" : `${m.name} done`); refresh(); onChanged(); } catch (e) { toast.error(e); }
  };
  return (
    <div>
      <div className="page-toolbar">
        <span className="small muted">{p.milestones.filter((m) => m.done).length} of {p.milestones.length} done</span>
        <span className="grow" />
        {manage && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEditing("new")}>New milestone</Button>}
      </div>
      {!p.milestones.length ? (
        <EmptyState title="No milestones" description="Milestones mark key dates like approvals and launches. Tasks can be linked to them." action={manage ? <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setEditing("new")}>Add milestone</Button> : undefined} />
      ) : (
        <div className="list">
          {p.milestones.map((m) => {
            const late = !m.done && m.date < t0;
            return (
              <div key={m.id} className="list-row">
                <Checkbox checked={m.done} disabled={!canEdit} onChange={() => toggle(m)} aria-label={`Mark ${m.name} done`} />
                <span className={`medium ellipsis ${m.done ? "faint" : ""}`} style={{ textDecoration: m.done ? "line-through" : undefined }}>{m.name}</span>
                {m.projectId !== p.id && <Badge size="sm" variant="outline">{p.children.find((c) => c.id === m.projectId)?.name ?? "Sub-project"}</Badge>}
                {m.description && <span className="small faint ellipsis grow">{m.description}</span>}
                <span className="grow" />
                {late && <Badge tone="red" size="sm">Missed</Badge>}
                {m.done && <Badge tone="green" size="sm">Done</Badge>}
                <span className={`small num ${late ? "danger" : "muted"}`} style={{ width: 92, textAlign: "right" }}>{fmtDate(m.date, true)}</span>
                {canEdit && (
                  <Menu placement="bottom-end" trigger={<IconButton size="sm" label={`Actions for ${m.name}`} icon={<MoreHorizontal size={14} />} />}
                    items={[{ label: "Edit", icon: <Pencil size={14} />, onSelect: () => setEditing(m) }, manage && { label: "Delete", icon: <Trash2 size={14} />, danger: true, onSelect: () => setRemoving(m) }]} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing && <MilestoneDialog project={p} m={editing === "new" ? undefined : editing} onClose={() => { setEditing(null); onChanged(); }} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} danger confirmLabel="Delete" title={`Delete ${removing?.name}?`} description="Tasks linked to it keep their dates but lose the milestone."
        onConfirm={async () => { try { await del(`/projects/milestones/${removing!.id}`); toast.success("Milestone deleted"); refresh(); onChanged(); } catch (e) { toast.error(e); } setRemoving(null); }} />
    </div>
  );
}

// ---------- Sub-projects ----------
export function SubProjects({ p, manage, onChanged }: { p: ProjectDetail; manage: boolean; onChanged: () => void }) {
  const { isAdmin } = useMe();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectDetail | null>(null);
  const [confirm, setConfirm] = useState<{ c: ChildProject; action: "archive" | "delete" } | null>(null);
  const edit = async (c: ChildProject) => { try { setEditing(await get<ProjectDetail>(`/projects/${c.id}`)); } catch (e) { toast.error(e); } };
  const act = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === "archive") { await post(`/projects/${confirm.c.id}/archive`, { archived: !confirm.c.archived }); toast.success(confirm.c.archived ? "Restored" : "Archived"); }
      else { await del(`/projects/${confirm.c.id}`); toast.success("Sub-project deleted"); }
      refresh(); onChanged();
    } catch (e) { toast.error(e); }
    setConfirm(null);
  };
  return (
    <div>
      <div className="page-toolbar">
        <span className="small muted">Sub-projects split the work (e.g. iOS / Android). Time and tasks roll up to {p.name}.</span>
        <span className="grow" />
        {manage && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New sub-project</Button>}
      </div>
      {!p.children.length ? (
        <EmptyState title="No sub-projects" description="Add sub-projects to organise larger projects." action={manage ? <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Add sub-project</Button> : undefined} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th style={{ paddingLeft: 20 }}>Name</th><th>Status</th><th>Start</th><th>End</th><th className="num">Estimate</th><th /></tr></thead>
            <tbody>
              {p.children.map((c) => (
                <tr key={c.id} className={`clickable ${c.archived ? s.archived : ""}`} onClick={() => nav(`/projects/${c.id}`)}>
                  <td style={{ paddingLeft: 20 }}><span className="row"><ProjectDot color={c.color} /><span className="medium">{c.name}</span>{c.archived && <Badge size="sm">Archived</Badge>}</span></td>
                  <td><span className="muted">{PROJECT_STATUS[c.status]?.label}</span></td>
                  <td className="muted">{c.startDate ? fmtDate(c.startDate, true) : "—"}</td>
                  <td className="muted">{c.endDate ? fmtDate(c.endDate, true) : "—"}</td>
                  <td className="num">{c.estimatedHours != null ? `${c.estimatedHours}h` : "—"}</td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    {manage && (
                      <Menu placement="bottom-end" trigger={<IconButton size="sm" label={`Actions for ${c.name}`} icon={<MoreHorizontal size={14} />} />}
                        items={[
                          { label: "Edit", icon: <Pencil size={14} />, onSelect: () => edit(c) },
                          { label: c.archived ? "Restore" : "Archive", icon: <Archive size={14} />, onSelect: () => setConfirm({ c, action: "archive" }) },
                          isAdmin && { label: "Delete", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirm({ c, action: "delete" }) },
                        ]} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <ProjectFormDialog parentId={p.id} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); onChanged(); }} />}
      {editing && <ProjectFormDialog project={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={act} danger={confirm?.action === "delete"}
        confirmLabel={confirm?.action === "delete" ? "Delete" : confirm?.c.archived ? "Restore" : "Archive"}
        title={confirm?.action === "delete" ? `Delete ${confirm.c.name}?` : `${confirm?.c.archived ? "Restore" : "Archive"} ${confirm?.c.name}?`}
        description={confirm?.action === "delete" ? "Only possible when no time was logged on it. Its tasks are deleted." : "Archived sub-projects stay in reports but can't take new time."}
      />
    </div>
  );
}

// ---------- Members ----------
export function Members({ p, manage, onChanged }: { p: ProjectDetail; manage: boolean; onChanged: () => void }) {
  const opts = useOptions();
  const [busy, setBusy] = useState(false);
  const users = opts.data?.users ?? [];
  const save = async (ids: number[]) => {
    setBusy(true);
    try { await put(`/projects/${p.id}/members`, { userIds: ids }); toast.success("Members updated"); refresh(); onChanged(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="page-toolbar">
        <span className="small muted">Members can see this project's tasks and log time on it.</span>
        <span className="grow" />
        {manage && (
          <Combobox multiple value={p.members.map((m) => m.id)} width={260} searchPlaceholder="Add or remove people…" onChange={(v) => save(v.map(Number))}
            options={users.map((u) => ({ value: u.id, label: u.name, icon: <Avatar name={u.name} size={16} />, hint: u.role?.toLowerCase() }))}
            trigger={<Button size="sm" variant="primary" icon={<Users size={14} />} loading={busy}>Manage members</Button>} />
        )}
      </div>
      {!p.members.length ? <EmptyState icon={<Users size={28} />} title="No members yet" description="Add the people who work on this project." /> : (
        <div className="list">
          {p.members.map((m) => {
            const u = users.find((x) => x.id === m.id);
            return (
              <div key={m.id} className="list-row">
                <Avatar name={m.name} size={22} />
                <span className="medium">{m.name}</span>
                {p.manager?.id === m.id && <Badge tone="accent" size="sm">Lead</Badge>}
                <span className="muted small">{u?.email}</span>
                <span className="grow" />
                <span className="small faint">{u?.role ? u.role.charAt(0) + u.role.slice(1).toLowerCase() : ""}</span>
                {manage && p.manager?.id !== m.id && <IconButton size="sm" label={`Remove ${m.name}`} icon={<Trash2 size={13} />} onClick={() => save(p.members.filter((x) => x.id !== m.id).map((x) => x.id))} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Notes ----------
export function Notes({ p, canEdit }: { p: ProjectDetail; canEdit: boolean }) {
  const [v, setV] = useState(p.notes ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(p.notes ?? ""), [p.notes]);
  const dirty = v !== (p.notes ?? "");
  const save = async () => {
    setBusy(true);
    try { await put(`/projects/${p.id}/notes`, { notes: v }); toast.success("Notes saved"); invalidate(`/projects/${p.id}`); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <div className="page-pad narrow col" style={{ gap: 10 }}>
      <div className="row"><span className="small muted grow">Shared notes for the team: decisions, links, meeting notes. Plain text or markdown.</span>
        {canEdit && <Button size="sm" variant="primary" disabled={!dirty} loading={busy} onClick={save}>Save notes</Button>}</div>
      <textarea className={s.notes} value={v} readOnly={!canEdit} onChange={(e) => setV(e.target.value)} placeholder={canEdit ? "Write project notes…" : "No notes yet."} aria-label="Project notes"
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (dirty) save(); } }} />
      {dirty && <span className="small warn">Unsaved changes</span>}
    </div>
  );
}

// ---------- Files ----------
type FilesResp = { links: Links; files: { id: number; name: string; mime: string; size: number; createdAt: string; user: { name: string }; task: { id: number; number: number; title: string } }[] };
export function Files({ p }: { p: ProjectDetail }) {
  const shell = useShell();
  const q = useApi<FilesResp>(`/projects/${p.id}/files`);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <SkeletonRows rows={5} />;
  const l = q.data.links;
  const links = [l.figma && ["Figma", l.figma], l.document && ["Document", l.document], l.drive && ["Google Drive", l.drive], ...(l.other ?? []).map((o) => [o.label, o.url])].filter(Boolean) as [string, string][];
  return (
    <div className="page-pad">
      <div className="section-title">Links</div>
      {links.length ? links.map(([label, url]) => (
        <a key={label + url} className={s.linkRow} href={url} target="_blank" rel="noopener noreferrer"><Link2 size={13} className="faint" /><span className="medium">{label}</span><span className="faint small ellipsis grow">{url}</span><ExternalLink size={12} className="faint" /></a>
      )) : <p className="small faint">No links yet.</p>}
      <div className="section-title" style={{ marginTop: 24 }}>Files from tasks</div>
      {!q.data.files.length ? <p className="small faint">Files attached to this project's tasks appear here.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Task</th><th>Added by</th><th className="num">Size</th><th>Added</th></tr></thead>
            <tbody>
              {q.data.files.map((f) => (
                <tr key={f.id}>
                  <td><a className="row link" href={`/api/tasks/attachments/${f.id}`} target="_blank" rel="noopener noreferrer">{f.mime.startsWith("image/") ? <ImageIcon size={13} /> : <FileText size={13} />}{f.name}</a></td>
                  <td><button type="button" className="link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => shell.openTask(f.task.id)}>{f.task.title}</button></td>
                  <td className="muted">{f.user.name}</td>
                  <td className="num muted">{fmtSize(f.size)}</td>
                  <td className="muted">{relTime(f.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Activity ----------
type ActivityItem = { at: string; actor: string; text: string; task: { id: number; number: number; title: string } | null };
export function Activity({ p }: { p: ProjectDetail }) {
  const shell = useShell();
  const q = useApi<ActivityItem[]>(`/projects/${p.id}/activity`);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <SkeletonRows rows={8} />;
  if (!q.data.length) return <EmptyState title="No activity yet" />;
  return (
    <div className="list">
      {q.data.map((a, i) => (
        <div key={i} className="list-row" style={{ height: "auto", minHeight: 36, paddingTop: 6, paddingBottom: 6 }}>
          <Avatar name={a.actor} size={18} />
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="medium">{a.actor}</span> <span className="muted">{a.text.length > 140 ? a.text.slice(0, 140) + "…" : a.text}</span>
            {a.task && <> <span className="faint">on</span> <button type="button" className="link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => shell.openTask(a.task!.id)}>{a.task.title}</button></>}
          </span>
          <span className="small faint" title={fmtDateTime(a.at)} style={{ whiteSpace: "nowrap" }}>{relTime(a.at)}</span>
        </div>
      ))}
    </div>
  );
}

