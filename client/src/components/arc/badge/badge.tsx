import type { ReactNode } from "react";
import { cx } from "../_lib/floating";
import s from "./badge.module.css";

export type BadgeTone = "gray" | "accent" | "green" | "yellow" | "orange" | "red" | "blue" | "purple";
export function Badge({ tone = "gray", children, dot, icon, size = "md", variant = "soft", title, className }: { tone?: BadgeTone; children?: ReactNode; dot?: boolean; icon?: ReactNode; size?: "sm" | "md"; variant?: "soft" | "outline"; title?: string; className?: string }) {
  return (
    <span title={title} className={cx(s.badge, s[tone], size === "sm" && s.sm, variant === "outline" && s.outline, className)}>
      {dot && <span className={s.dot} />}
      {icon}
      {children}
    </span>
  );
}
