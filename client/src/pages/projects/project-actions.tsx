import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog, IconButton, Menu, toast } from "@/components/ui";
import { del, post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import type { Project } from "./lib";
import { ProjectFormDialog } from "./project-form";

/** ⋯ menu for admins and project managers: edit, archive or restore, and delete a project. */
export function ProjectActions({ p, onChanged, afterDelete, size = "sm" }: { p: Project; onChanged?: () => void; afterDelete?: string; size?: "sm" | "md" }) {
  const { can } = useMe();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  if (!can("projects", "manage")) return null;
  const refresh = () => { invalidate("/projects"); invalidate("/options"); invalidate("/roadmap"); onChanged?.(); };
  const run = async () => {
    setBusy(true);
    try {
      if (confirm === "archive") { await post(`/projects/${p.id}/archive`, { archived: !p.archived }); toast.success(p.archived ? `Restored ${p.name}` : `Archived ${p.name}`); refresh(); }
      else { await del(`/projects/${p.id}`); toast.success(`Deleted ${p.name}`); refresh(); if (afterDelete) nav(afterDelete); }
      setConfirm(null);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Menu
        placement="bottom-end"
        trigger={<IconButton size={size} variant="ghost" label={`Actions for ${p.name}`} icon={<MoreHorizontal size={15} />} />}
        items={[
          { label: "Edit project", icon: <Pencil size={14} />, onSelect: () => setEditing(true) },
          { label: p.archived ? "Restore" : "Archive", icon: p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, onSelect: () => setConfirm("archive") },
          { type: "separator" },
          { label: "Delete project", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirm("delete") },
        ]}
      />
      {editing && <ProjectFormDialog project={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      <ConfirmDialog
        open={confirm !== null} onClose={() => setConfirm(null)} loading={busy} danger={confirm === "delete"}
        title={confirm === "delete" ? `Delete ${p.name}?` : `${p.archived ? "Restore" : "Archive"} ${p.name}?`}
        description={confirm === "delete"
          ? "This permanently removes the project with its sub-projects, milestones and tasks. A project that already has logged time can't be deleted; archive it instead so its hours stay in reports."
          : p.archived ? "People can log time on it again." : "It's hidden from pickers and no new time can be logged. Its history stays in reports. Sub-projects are archived too."}
        confirmLabel={confirm === "delete" ? "Delete project" : p.archived ? "Restore" : "Archive"}
        onConfirm={run}
      />
    </span>
  );
}
