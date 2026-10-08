import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 4px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-2)", fontSize: 11, fontFamily: "var(--font)", fontWeight: 500, lineHeight: 1 }}>
      {children}
    </kbd>
  );
}
