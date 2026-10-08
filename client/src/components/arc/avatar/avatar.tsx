import { cx } from "../_lib/floating";
import s from "./avatar.module.css";

const COLORS = ["#5e6ad2", "#26b5ce", "#4cb782", "#f2994a", "#eb5757", "#bb87fc", "#e0b400", "#4ea7fc", "#d96ba4", "#7a8a99"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
export const colorFor = (key: string) => { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

export function Avatar({ name, size = 20, src, title }: { name?: string | null; size?: number; src?: string | null; title?: string }) {
  if (!name) return <span className={cx(s.avatar, s.empty)} style={{ width: size, height: size }} title={title ?? "Unassigned"} />;
  return (
    <span className={s.avatar} title={title ?? name} style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.42)), background: colorFor(name) }}>
      {src ? <img src={src} alt="" width={size} height={size} /> : initials(name)}
    </span>
  );
}

export function AvatarGroup({ names, max = 4, size = 20 }: { names: string[]; max?: number; size?: number }) {
  return (
    <span className={s.group}>
      {names.slice(0, max).map((n) => <Avatar key={n} name={n} size={size} />)}
      {names.length > max && <span className={cx(s.avatar, s.more)} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>+{names.length - max}</span>}
    </span>
  );
}
