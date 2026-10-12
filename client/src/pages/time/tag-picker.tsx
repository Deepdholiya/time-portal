import { useState, type ReactElement } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Button, Combobox, IconButton, Input, toast, type ComboboxOption } from "@/components/ui";
import { del, post, put } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { Tag, TagLite } from "@/lib/types";
import { ColorPicker, PALETTE } from "../admin/shared";
import { tagOptions, useTags } from "./time-utils";

/**
 * Tag picker for time entries. Lists the tags the person's team can use. Admins can also type a new tag name to create it
 * (available to every team, and can be limited later under Admin → Time tags), and rename, recolour or delete a tag in place.
 */
export function TagPicker({ value, onChange, userId, keep, trigger, size }: {
  value: number[]; onChange: (ids: number[]) => void; userId?: number; keep?: TagLite[]; trigger?: ReactElement; size?: "sm" | "md";
}) {
  const { can } = useSession();
  const tags = useTags(userId);
  const admin = can("settings", "yes");
  const create = async (name: string) => {
    try {
      const t = await post<Tag>("/tags", { name, color: PALETTE[(tags.data?.length ?? 0) % PALETTE.length], teamIds: [], active: true });
      invalidate("/tags");
      tags.reload();
      toast.success(`Created the tag ${t.name}`);
      return t.id;
    } catch (e) { toast.error(e); throw e; }
  };
  const changed = () => { invalidate("/tags"); invalidate("/time"); tags.reload(); };
  return (
    <Combobox
      multiple
      options={tagOptions(tags.data, keep)}
      value={value}
      onChange={(v) => onChange(v.map(Number))}
      placeholder="Add tags"
      searchPlaceholder={admin ? "Search or create a tag…" : "Search tags…"}
      emptyText={admin ? "Type a name to create a tag" : "No tags match"}
      onCreate={admin ? create : undefined}
      renderEditor={admin ? (o, done) => <TagEditor key={o.value} tag={tags.data?.find((x) => x.id === Number(o.value)) ?? { id: Number(o.value), name: o.label, color: PALETTE[0] }} option={o} done={done} onChanged={changed} onDeleted={(id) => onChange(value.filter((v) => v !== id))} /> : undefined}
      picker
      createLabel={(n) => `Create tag “${n}”`}
      trigger={trigger}
      size={size}
      width={trigger ? 260 : undefined}
      aria-label="Tags"
    />
  );
}

/** Rename, recolour or delete a tag without leaving the picker. A tag already used on entries is hidden from pickers instead of deleted. */
function TagEditor({ tag, done, onChanged, onDeleted }: { tag: Pick<Tag, "id" | "name" | "color">; option: ComboboxOption; done: () => void; onChanged: () => void; onDeleted: (id: number) => void }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error("Give the tag a name");
    setBusy(true);
    try {
      await put(`/tags/${tag.id}`, { name: name.trim(), color });
      toast.success("Tag saved");
      onChanged();
      done();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const r = await del<{ deactivated?: boolean }>(`/tags/${tag.id}`);
      toast.success(r?.deactivated ? `Removed ${tag.name}` : `Deleted ${tag.name}`, { description: r?.deactivated ? "Entries that already use it keep the label." : undefined });
      onDeleted(tag.id);
      onChanged();
      done();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (!confirm) save(); } }}>
      <div className="row gap-4">
        <IconButton size="sm" label="Back to tags" icon={<ChevronLeft size={14} />} onClick={done} />
        <span className="medium small">Edit tag</span>
      </div>
      <Input size="sm" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Tag name" />
      <ColorPicker value={color} onChange={setColor} />
      {confirm ? (
        <div className="row gap-4" style={{ justifyContent: "flex-end" }}>
          <span className="small muted grow">Delete {tag.name}?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
          <Button size="sm" variant="danger" loading={busy} onClick={remove}>Delete</Button>
        </div>
      ) : (
        <div className="row gap-4">
          <Button size="sm" variant="danger-ghost" icon={<Trash2 size={13} />} onClick={() => setConfirm(true)}>Delete</Button>
          <span className="grow" />
          <Button size="sm" variant="secondary" onClick={done}>Cancel</Button>
          <Button size="sm" variant="primary" loading={busy} onClick={save}>Save</Button>
        </div>
      )}
    </div>
  );
}
