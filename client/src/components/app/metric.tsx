import type { ReactNode } from "react";

/** The label of a metric tile: a small icon tile, then the name. Every number on a dashboard is labelled this way. */
export function MetricLabel({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return <span className={`metric-label ${className ?? ""}`}><span className="metric-icon" aria-hidden>{icon}</span><span className="ellipsis">{children}</span></span>;
}
