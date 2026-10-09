import type { CSSProperties } from "react";
import { Avatar as ArcAvatar } from "../arc/avatar/avatar";
import { cx } from "./shared";
import s from "./ui.module.css";

const COLORS = ["#5e6ad2", "#26b5ce", "#4cb782", "#f2994a", "#eb5757", "#bb87fc", "#e0b400", "#4ea7fc", "#d96ba4", "#7a8a99"];
export const colorFor = (key: string) => { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

/** Arc Avatar at a pixel size, tinted per person like Linear. A missing name draws the dashed "unassigned" circle. */
export function Avatar({ name, size = 20, src, title }: { name?: string | null; size?: number; src?: string | null; title?: string }) {
  if (!name) return <span className={s.avatarEmpty} style={{ width: size, height: size }} title={title ?? "Unassigned"} />;
  return (
    <ArcAvatar
      name={name}
      src={src ?? undefined}
      size="sm"
      title={title ?? name}
      className={s.avatar}
      style={{ "--av": `${size}px`, "--av-bg": colorFor(name) } as CSSProperties}
    />
  );
}

export function AvatarGroup({ names, max = 4, size = 20 }: { names: string[]; max?: number; size?: number }) {
  return (
    <span className={s.avatarGroup}>
      {names.slice(0, max).map((n) => <Avatar key={n} name={n} size={size} />)}
      {names.length > max && <span className={cx(s.avatarMore)} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>+{names.length - max}</span>}
    </span>
  );
}
