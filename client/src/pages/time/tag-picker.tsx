import type { ReactElement } from "react";
import { Combobox, toast } from "@/components/ui";
import { post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { Tag, TagLite } from "@/lib/types";
import { PALETTE } from "../admin/shared";
import { tagOptions, useTags } from "./time-utils";

/**
 * Tag picker for time entries. Lists the tags the person's team can use; admins can also type a new tag name and create it
 * on the spot (it's available to every team, and can be limited later under Admin → Time tags).
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
      picker
      createLabel={(n) => `Create tag “${n}”`}
      trigger={trigger}
      size={size}
      width={trigger ? 260 : undefined}
      aria-label="Tags"
    />
  );
}
