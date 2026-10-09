import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Tags as TagsIcon, Trash2 } from "lucide-react";
import { Badge, Button, Combobox, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Menu, SkeletonRows, Switch, toast } from "@/components/ui";
import { Page } from "@/components/app/page";
import { del, post, put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import type { Tag } from "@/lib/types";
import { useOptions } from "../time/time-utils";
import { ColorPicker, PALETTE } from "./shared";

/** Company-wide time tags. Admins decide which teams can use each one; employees pick from that list but can't add their own. */
export default function TagsAdmin() {
  const { data, error, loading, reload } = useApi<Tag[]>("/tags", { all: 1 });
  const { data: options } = useOptions();
  const [edit, setEdit] = useState<Tag | "new" | null>(null);
  const [remove, setRemove] = useState<Tag | null>(null);
  const [busy, setBusy] = useState(false);
  const teams = new Map((options?.teams ?? []).map((t) => [t.id, t]));
  const after = () => { reload(); invalidate("/tags"); invalidate("/options"); };

  const toggle = async (t: Tag) => {
    try { await put(`/tags/${t.id}`, { active: !t.active }); toast.success(t.active ? `${t.name} deactivated` : `${t.name} activated`, { description: t.active ? "It stays on past entries but can't be picked any more." : undefined }); after(); }
    catch (e) { toast.error(e); }
  };
  const doRemove = async () => {
    if (!remove) return;
    setBusy(true);
    try { await del(`/tags/${remove.id}`); toast.success(`Deleted ${remove.name}`); setRemove(null); after(); }
    catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Page title="Time tags" icon={<TagsIcon size={15} className="faint" />} actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit("new")}>New tag</Button>}>
      <div style={{ padding: "16px 20px 32px", maxWidth: 920 }}>
        <p className="small muted" style={{ margin: "0 0 12px" }}>Tags label time entries (meetings, bug fixes, client calls) for reports. Limit a tag to teams to keep each team's list short. Whether a tag is required is set in Company settings → Time.</p>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={5} /> : !data?.length ? (
          <EmptyState icon={<TagsIcon size={24} />} title="No tags yet" description="Create the tags your teams should use on their time." action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit("new")}>New tag</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tag</th><th>Available to</th><th className="num">Entries</th><th>Active</th><th style={{ width: 44 }} /></tr></thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} style={{ opacity: t.active ? 1 : 0.6 }}>
                    <td><span className="row gap-4"><span className="dot" style={{ background: t.color }} /><span className="medium">{t.name}</span>{!t.active && <Badge size="sm">Inactive</Badge>}</span></td>
                    <td>{t.teamIds.length ? <span className="row gap-4" style={{ flexWrap: "wrap" }}>{t.teamIds.map((id) => <Badge key={id} size="sm" variant="outline">{teams.get(id)?.name ?? "Removed team"}</Badge>)}</span> : <span className="muted">All teams</span>}</td>
                    <td className="num">{t.uses}</td>
                    <td><Switch checked={t.active} onChange={() => toggle(t)} aria-label={`${t.name} active`} /></td>
                    <td className="right">
                      <Menu placement="bottom-end" trigger={<IconButton size="sm" label={`Actions for ${t.name}`} icon={<MoreHorizontal size={14} />} />} items={[
                        { label: "Edit", icon: <Pencil size={14} />, onSelect: () => setEdit(t) },
                        { label: t.uses ? "Delete (only unused tags)" : "Delete", icon: <Trash2 size={14} />, danger: true, disabled: t.uses > 0, onSelect: () => setRemove(t) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <TagDialog tag={edit === "new" ? null : edit} teams={options?.teams ?? []} onClose={() => setEdit(null)} onSaved={after} />}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} onConfirm={doRemove} danger loading={busy} confirmLabel="Delete tag" title={`Delete the tag “${remove?.name}”?`} description="It isn't on any entries, so nothing else changes." />
    </Page>
  );
}

function TagDialog({ tag, teams, onClose, onSaved }: { tag: Tag | null; teams: { id: number; name: string; color?: string }[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? PALETTE[0]);
  const [teamIds, setTeamIds] = useState<number[]>(tag?.teamIds ?? []);
  const [active, setActive] = useState(tag?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!name.trim()) return setError("Name the tag.");
    setBusy(true); setError(null);
    try {
      const body = { name: name.trim(), color, teamIds, active };
      if (tag) await put(`/tags/${tag.id}`, body); else await post("/tags", body);
      toast.success(tag ? "Tag saved" : `Created ${name.trim()}`);
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the tag."); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="sm" title={tag ? "Edit tag" : "New tag"} onSubmit={save}
      footer={<><div className="grow" /><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{tag ? "Save" : "Create tag"}</Button></>}>
      <div className="form-grid">
        <Field label="Name" required className="full" error={error ?? undefined}><Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client call" /></Field>
        <Field label="Color" className="full"><ColorPicker value={color} onChange={setColor} /></Field>
        <Field label="Available to" className="full" hint="Leave empty to let every team use it.">
          <Combobox multiple options={teams.map((t) => ({ value: t.id, label: t.name, icon: <span className="dot" style={{ background: t.color }} /> }))} value={teamIds} onChange={(v) => setTeamIds(v.map(Number))} placeholder="All teams" aria-label="Teams" />
        </Field>
        <Field label="Active" className="full" hint="Inactive tags stay on past entries but can't be picked."><Switch checked={active} onChange={setActive} label={active ? "Active" : "Inactive"} aria-label="Active" /></Field>
      </div>
    </Dialog>
  );
}
