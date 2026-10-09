import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Copy, FileStack, Link2, Pencil, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Dialog, Input, toast } from "@/components/ui";
import { del, post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import type { ProjectDetail } from "./lib";
import { ProjectFormDialog } from "./project-form";
import s from "./projects.module.css";

/** Edit, archive, client share link, save as template, delete (admin). */
export function ProjectSettings({ p, onChanged }: { p: ProjectDetail; onChanged: () => void }) {
  const { can, isAdmin } = useMe();
  const nav = useNavigate();
  const manage = can("projects", "manage");
  const canShare = manage || can("clientEmail", "yes");
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | "share" | "revoke" | null>(null);
  const [token, setToken] = useState<string | null>(p.clientShareToken ?? null);
  const [tpl, setTpl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shareUrl = token ? `${location.origin}/client/${token}` : null;
  const refresh = () => { invalidate("/projects"); invalidate("/options"); onChanged(); };

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast.error(e); } finally { setBusy(false); setConfirm(null); } };
  const copy = async () => { try { await navigator.clipboard.writeText(shareUrl!); toast.success("Link copied"); } catch { toast.error("Couldn't copy, select the link and copy it manually"); } };

  return (
    <div className="page-pad narrow">
      {manage && (
        <div className={s.settingRow}>
          <div className="grow"><div className="medium">Project details</div><div className="small muted">Name, client and contact, people, dates, billing, tags and links.</div></div>
          <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>Edit project</Button>
        </div>
      )}
      {canShare && !p.parentId && (
        <div className={s.settingRow} style={{ alignItems: "flex-start" }}>
          <div className="grow">
            <div className="medium">Client status link</div>
            <div className="small muted">A read-only page with progress, milestones and health. No internal notes, people or rates are shown.</div>
            {shareUrl && (
              <div className={s.shareBox}>
                <Input size="sm" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Client link" />
                <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={copy}>Copy</Button>
                <Button size="sm" variant="ghost" onClick={() => window.open(shareUrl, "_blank", "noopener")}>Open</Button>
              </div>
            )}
          </div>
          {shareUrl
            ? <Button variant="danger-ghost" onClick={() => setConfirm("revoke")}>Revoke link</Button>
            : <Button variant="secondary" icon={<Link2 size={14} />} onClick={() => setConfirm("share")}>Create link</Button>}
        </div>
      )}
      {manage && !p.parentId && (
        <div className={s.settingRow}>
          <div className="grow"><div className="medium">Save as template</div><div className="small muted">Reuse sub-projects, milestones, tasks, sub-tasks and dependencies with relative dates.</div></div>
          <Button variant="secondary" icon={<FileStack size={14} />} onClick={() => setTpl(`${p.name} template`)}>Save as template</Button>
        </div>
      )}
      {manage && (
        <div className={s.settingRow}>
          <div className="grow"><div className="medium">{p.archived ? "Restore project" : "Archive project"}</div><div className="small muted">{p.archived ? "Make it active again so people can log time." : "Hides it from pickers and stops new time. History stays in reports."}</div></div>
          <Button variant="secondary" icon={<Archive size={14} />} onClick={() => setConfirm("archive")}>{p.archived ? "Restore" : "Archive"}</Button>
        </div>
      )}
      {isAdmin && (
        <div className={s.settingRow}>
          <div className="grow"><div className="medium danger">Delete project</div><div className="small muted">Only possible when no time has been logged. Otherwise archive it.</div></div>
          <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirm("delete")}>Delete</Button>
        </div>
      )}
      {!manage && !canShare && <p className="muted">You don't have permission to change this project.</p>}

      {editing && <ProjectFormDialog project={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      <Dialog open={tpl !== null} onClose={() => setTpl(null)} title="Save as template" size="sm" onSubmit={() => run(async () => { await post(`/projects/${p.id}/template`, { name: tpl!.trim() }); toast.success("Template saved"); invalidate("/options"); setTpl(null); })}
        footer={<><Button variant="ghost" onClick={() => setTpl(null)}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!tpl?.trim()}>Save template</Button></>}>
        <Input autoFocus value={tpl ?? ""} onChange={(e) => setTpl(e.target.value)} maxLength={100} aria-label="Template name" />
      </Dialog>
      <ConfirmDialog
        open={confirm !== null} onClose={() => setConfirm(null)} loading={busy}
        danger={confirm === "delete" || confirm === "revoke"}
        title={confirm === "archive" ? `${p.archived ? "Restore" : "Archive"} ${p.name}?` : confirm === "delete" ? `Delete ${p.name}?` : confirm === "share" ? "Create a client link?" : "Revoke the client link?"}
        description={confirm === "archive" ? (p.archived ? "People can log time on it again." : "Sub-projects are archived too.") : confirm === "delete" ? "This permanently removes the project, its sub-projects, milestones and tasks." : confirm === "share" ? "Anyone with the link can see this project's progress, milestones and health without signing in." : "The current link stops working immediately."}
        confirmLabel={confirm === "archive" ? (p.archived ? "Restore" : "Archive") : confirm === "delete" ? "Delete project" : confirm === "share" ? "Create link" : "Revoke"}
        onConfirm={() => run(async () => {
          if (confirm === "archive") { await post(`/projects/${p.id}/archive`, { archived: !p.archived }); toast.success(p.archived ? "Project restored" : "Project archived"); refresh(); }
          else if (confirm === "delete") { await del(`/projects/${p.id}`); toast.success("Project deleted"); invalidate("/projects"); invalidate("/options"); nav("/projects"); }
          else if (confirm === "share") { const r = await post<{ token: string }>(`/projects/${p.id}/share`); setToken(r.token); toast.success("Client link created"); refresh(); }
          else { await del(`/projects/${p.id}/share`); setToken(null); toast.success("Link revoked"); refresh(); }
        })}
      />
    </div>
  );
}
