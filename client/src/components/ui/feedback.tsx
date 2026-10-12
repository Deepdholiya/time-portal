import type { CSSProperties, ReactNode } from "react";
import { Alert } from "../arc/alert/alert";
import { Button } from "./button";
import { Skeleton as ArcSkeleton } from "../arc/skeleton/skeleton";
import { cx, textOf } from "./shared";
import s from "./ui.module.css";

/** Small inline spinner, the same ring Arc's Button shows while loading. */
export function Spinner({ size = 14, label = "Loading" }: { size?: number; label?: string }) {
  return <span role="status" aria-label={label} className={s.spinner} style={{ width: size, height: size }} />;
}

/** Centered loading state for a page or panel. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className={s.loading}><Spinner />{label}</div>;
}

/** Arc Skeleton lines; with a width or height it draws a single sized bar for KPI tiles and charts. */
export function Skeleton({ width, height, radius = 4, style, lines = 3 }: { width?: number | string; height?: number | string; radius?: number; style?: CSSProperties; lines?: number }) {
  if (width === undefined && height === undefined) return <ArcSkeleton lines={lines} />;
  return <span className={s.bar} style={{ width: width ?? "100%", height: height ?? 12, borderRadius: radius, ...style }} />;
}

/** Placeholder for a loading list: Arc Skeleton lines inside the list's padding. */
export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return <div style={{ padding: "16px 20px" }}><ArcSkeleton label="Loading rows" lines={Math.min(rows, 6)} /></div>;
}

/**
 * Empty state with a small animated illustration: two cards float behind a tile holding the page's icon while sparkles twinkle
 * around it. Motion stops when the person asks for reduced motion. `compact` trims the padding and the art for panels.
 */
export function EmptyState({ icon, title, description, action, compact }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("tp-empty", compact && "tp-empty-compact")} role="status">
      <EmptyArt icon={icon} />
      <h3>{textOf(title)}</h3>
      {description && <p>{textOf(description)}</p>}
      {action && <div className="tp-empty-action">{action}</div>}
    </div>
  );
}

function EmptyArt({ icon }: { icon?: ReactNode }) {
  return (
    <div className="tp-empty-art" aria-hidden>
      <svg viewBox="0 0 160 112" width="160" height="112">
        <ellipse className="tp-empty-shadow" cx="80" cy="100" rx="38" ry="5" />
        <circle className="tp-empty-orbit" cx="80" cy="54" r="46" />
        <g className="tp-empty-card tp-empty-card-l"><rect x="22" y="30" width="54" height="40" rx="8" /><rect className="tp-empty-line" x="31" y="42" width="26" height="4" rx="2" /><rect className="tp-empty-line" x="31" y="51" width="18" height="4" rx="2" /></g>
        <g className="tp-empty-card tp-empty-card-r"><rect x="84" y="24" width="54" height="40" rx="8" /><rect className="tp-empty-line" x="93" y="36" width="30" height="4" rx="2" /><rect className="tp-empty-line" x="93" y="45" width="20" height="4" rx="2" /></g>
        <circle className="tp-empty-spark tp-s1" cx="30" cy="20" r="2.5" />
        <circle className="tp-empty-spark tp-s2" cx="136" cy="80" r="2" />
        <circle className="tp-empty-spark tp-s3" cx="128" cy="14" r="1.6" />
        <path className="tp-empty-spark tp-s4" d="M18 76 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z" />
      </svg>
      <div className="tp-empty-tile">{icon}</div>
    </div>
  );
}

/** Arc Alert for failed loads, with an optional retry. */
export function ErrorState({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div style={{ margin: 16 }}>
      <Alert tone="danger" title={typeof error === "string" ? error : error.message}>
        {onRetry && <Button size="sm" variant="secondary" onClick={onRetry} style={{ marginTop: 8 }}>Retry</Button>}
      </Alert>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
}
