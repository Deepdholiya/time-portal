import { Badge, Tooltip } from "@/components/arc";
import { HEALTH_META } from "@/components/app/icons";
import type { Project } from "./lib";

export function HealthBadge({ p }: { p: Project }) {
  if (!p.stats) return null;
  if (p.status === "COMPLETED") return <Badge tone="gray" size="sm">Completed</Badge>;
  const h = HEALTH_META[p.stats.health] ?? HEALTH_META.NONE;
  return <Tooltip content={p.stats.reasons.length ? p.stats.reasons.join(" · ") : "No issues"}><span><Badge tone={h.tone} dot size="sm">{h.label}</Badge></span></Tooltip>;
}
