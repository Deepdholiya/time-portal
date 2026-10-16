import type { Priority, TaskStatus } from "@/lib/types";

export const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  BACKLOG: { label: "Backlog", color: "var(--status-backlog)" },
  TODO: { label: "Todo", color: "var(--status-todo)" },
  IN_PROGRESS: { label: "In Progress", color: "var(--status-progress)" },
  IN_REVIEW: { label: "In Review", color: "var(--status-review)" },
  BLOCKED: { label: "Blocked", color: "var(--status-blocked)" },
  DONE: { label: "Done", color: "var(--status-done)" },
};
export const STATUSES = Object.keys(STATUS_META) as TaskStatus[];

export const PRIORITY_META: Record<Priority, { label: string; rank: number }> = {
  URGENT: { label: "Urgent", rank: 0 }, HIGH: { label: "High", rank: 1 }, MEDIUM: { label: "Medium", rank: 2 }, LOW: { label: "Low", rank: 3 }, NONE: { label: "No priority", rank: 4 },
};
export const PRIORITIES = Object.keys(PRIORITY_META) as Priority[];

/** Linear-style status circle. */
export function StatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const c = STATUS_META[status]?.color ?? "var(--text-3)";
  const r = 6, C = 2 * Math.PI * 3;
  const common = { width: size, height: size, viewBox: "0 0 14 14", style: { flexShrink: 0 }, "aria-label": STATUS_META[status]?.label, role: "img" } as const;
  switch (status) {
    case "BACKLOG":
      return <svg {...common}><circle cx="7" cy="7" r={r} fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="1.4 1.65" /></svg>;
    case "TODO":
      return <svg {...common}><circle cx="7" cy="7" r={r} fill="none" stroke={c} strokeWidth="1.5" /></svg>;
    case "IN_PROGRESS":
      return <svg {...common}><circle cx="7" cy="7" r={r} fill="none" stroke={c} strokeWidth="1.5" /><circle cx="7" cy="7" r="3" fill="none" stroke={c} strokeWidth="6" strokeDasharray={`${C / 2} ${C}`} transform="rotate(-90 7 7)" /></svg>;
    case "IN_REVIEW":
      return <svg {...common}><circle cx="7" cy="7" r={r} fill="none" stroke={c} strokeWidth="1.5" /><circle cx="7" cy="7" r="3" fill="none" stroke={c} strokeWidth="6" strokeDasharray={`${C * 0.75} ${C}`} transform="rotate(-90 7 7)" /></svg>;
    case "BLOCKED":
      return <svg {...common}><circle cx="7" cy="7" r="7" fill={c} /><path d="M4.5 7h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "DONE":
      return <svg {...common}><circle cx="7" cy="7" r="7" fill={c} /><path d="M4.2 7.2l1.9 1.9 3.8-4" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
}

/** Linear-style priority bars. */
export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 14 14", style: { flexShrink: 0 }, role: "img", "aria-label": PRIORITY_META[priority]?.label } as const;
  if (priority === "URGENT")
    return <svg {...common}><rect x="0.5" y="0.5" width="13" height="13" rx="3" fill="var(--orange)" /><path d="M7 3.5v4.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /><circle cx="7" cy="10.2" r="1" fill="#fff" /></svg>;
  if (priority === "NONE")
    return <svg {...common}><g fill="var(--text-3)"><rect x="1.5" y="6.25" width="2.5" height="1.5" rx=".5" /><rect x="5.75" y="6.25" width="2.5" height="1.5" rx=".5" /><rect x="10" y="6.25" width="2.5" height="1.5" rx=".5" /></g></svg>;
  const n = priority === "HIGH" ? 3 : priority === "MEDIUM" ? 2 : 1;
  return (
    <svg {...common}>
      {[0, 1, 2].map((i) => <rect key={i} x={1.5 + i * 4.25} y={9 - i * 3} width="2.75" height={4 + i * 3} rx=".75" fill={i < n ? "var(--text-2)" : "var(--border-strong)"} />)}
    </svg>
  );
}

export function ProjectDot({ color, size = 8 }: { color?: string | null; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: 2.5, background: color ?? "var(--text-3)", display: "inline-block", flexShrink: 0 }} />;
}

/** Health pill tone for ON_TRACK / AT_RISK / DELAYED. */
export const HEALTH_META: Record<string, { label: string; tone: "green" | "yellow" | "red" | "gray" }> = {
  ON_TRACK: { label: "On track", tone: "green" }, AT_RISK: { label: "At risk", tone: "yellow" }, DELAYED: { label: "Delayed", tone: "red" }, NONE: { label: "No updates", tone: "gray" },
};
