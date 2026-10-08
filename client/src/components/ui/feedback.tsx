import type { CSSProperties, ReactNode } from "react";
import { Alert } from "../arc/alert/alert";
import { Button } from "./button";
import { EmptyState as ArcEmptyState } from "../arc/empty-state/empty-state";
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

/** Arc EmptyState. `compact` trims the padding for panels. */
export function EmptyState({ icon, title, description, action, compact }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return <ArcEmptyState icon={icon} title={textOf(title)} description={description ? textOf(description) : ""} action={action} className={cx(compact && s.compact)} />;
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
