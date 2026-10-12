import { Badge, Tooltip } from "@/components/ui";
import { HEALTH_META } from "@/components/app/icons";
import { PROJECT_STATUS, type Project } from "./lib";

export function HealthBadge({ p }: { p: Project }) {
  if (!p.stats) return null;
  if (p.status === "COMPLETED") return <Badge tone="gray" size="sm">Completed</Badge>;
  const h = HEALTH_META[p.stats.health] ?? HEALTH_META.NONE;
  return <Tooltip content={p.stats.reasons.length ? p.stats.reasons.join(" · ") : "No issues"}><span><Badge tone={h.tone} dot size="sm">{h.label}</Badge></span></Tooltip>;
}

/** The project's status as a chip; its dot carries the computed health, explained in the tooltip. */
export function StatusChip({ p }: { p: Project }) {
  const label = PROJECT_STATUS[p.status]?.label ?? p.status;
  const done = p.status === "COMPLETED";
  const h = HEALTH_META[p.stats?.health ?? "NONE"] ?? HEALTH_META.NONE;
  const tip = done ? "Completed" : `Health: ${h.label}${p.stats?.reasons.length ? ` · ${p.stats.reasons.join(" · ")}` : ""}`;
  return <Tooltip content={tip}><span><Badge tone={done ? "gray" : h.tone} dot size="sm">{label}</Badge></span></Tooltip>;
}
