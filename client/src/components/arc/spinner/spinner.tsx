export function Spinner({ size = 14, label = "Loading" }: { size?: number; label?: string }) {
  return <span role="status" aria-label={label} style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", border: "1.5px solid var(--border-strong)", borderTopColor: "var(--accent)", animation: "tp-spin 0.7s linear infinite", flexShrink: 0 }} />;
}

/** Centered loading state for a page or panel. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 48, color: "var(--text-3)" }}><Spinner />{label}</div>;
}
