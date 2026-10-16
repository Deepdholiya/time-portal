import type { CSSProperties, ReactNode } from "react";
import { Badge as ArcBadge, type BadgeTone as ArcTone } from "../arc/badge/badge";
import { cx } from "./shared";
import s from "./ui.module.css";

export type BadgeTone = "gray" | "accent" | "green" | "yellow" | "orange" | "red" | "blue" | "purple";

const tone: Record<BadgeTone, ArcTone> = { gray: "neutral", accent: "info", green: "success", yellow: "warning", orange: "warning", red: "danger", blue: "info", purple: "info" };
/** Arc has five tones; the app's extra hues reuse the closest tone and repaint it through Arc's badge variables. */
const hue: Partial<Record<BadgeTone, string>> = { orange: "var(--orange)", blue: "var(--blue)", purple: "var(--purple)" };
const paint = (c: string) => ({ "--badge-color": c, "--badge-foreground": c, "--badge-background": `color-mix(in oklab, ${c} 11%, var(--surface))`, "--badge-border": `color-mix(in oklab, ${c} 24%, var(--border))` }) as CSSProperties;

export function Badge({ tone: t = "gray", children, dot, icon, size = "md", variant = "soft", title, className }: { tone?: BadgeTone; children?: ReactNode; dot?: boolean; icon?: ReactNode; size?: "sm" | "md"; variant?: "soft" | "outline"; title?: string; className?: string }) {
  return (
    <ArcBadge
      tone={tone[t]}
      size={size}
      title={title}
      icon={dot ? <span className={s.badgeDot} /> : icon}
      style={hue[t] ? paint(hue[t]!) : undefined}
      className={cx(s.badge, size === "sm" && s.badgeSm, variant === "outline" && s.outline, className)}
    >
      {children}
    </ArcBadge>
  );
}
