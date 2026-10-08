import type { ReactNode } from "react";

export function EmptyState({ icon, title, description, action, compact }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8, padding: compact ? "24px 16px" : "64px 24px", color: "var(--text-2)" }}>
      {icon && <div style={{ color: "var(--text-3)", marginBottom: 4 }}>{icon}</div>}
      <div style={{ fontWeight: 500, color: "var(--text)" }}>{title}</div>
      {description && <div style={{ maxWidth: 380, fontSize: 13 }}>{description}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/** Inline error box for failed loads. */
export function ErrorState({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ margin: 16, padding: "10px 12px", borderRadius: 8, background: "var(--red-soft)", color: "var(--red)", display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{ flex: 1 }}>{typeof error === "string" ? error : error.message}</span>
      {onRetry && <button type="button" onClick={onRetry} style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer" }}>Retry</button>}
    </div>
  );
}
