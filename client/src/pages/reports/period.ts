import { addDays, monthEnd, monthStart, parseDate, isoDate, today, weekStart, fmtDate, monthName } from "@/lib/format";

export type Preset = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
export const PRESET_LABEL: Record<Preset, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly", custom: "Custom" };

const quarterStart = (d: string) => { const x = parseDate(d); return isoDate(new Date(x.getFullYear(), Math.floor(x.getMonth() / 3) * 3, 1)); };
const quarterEnd = (d: string) => { const x = parseDate(quarterStart(d)); return isoDate(new Date(x.getFullYear(), x.getMonth() + 3, 0)); };

/** Date range for a preset period containing `anchor`. */
export function periodRange(p: Preset, anchor = today(), weekStartsOn = 1): { from: string; to: string } {
  switch (p) {
    case "daily": return { from: anchor, to: anchor };
    case "weekly": { const f = weekStart(anchor, weekStartsOn); return { from: f, to: addDays(f, 6) }; }
    case "monthly": return { from: monthStart(anchor), to: monthEnd(anchor) };
    case "quarterly": return { from: quarterStart(anchor), to: quarterEnd(anchor) };
    case "yearly": return { from: anchor.slice(0, 4) + "-01-01", to: anchor.slice(0, 4) + "-12-31" };
    default: return { from: anchor, to: anchor };
  }
}

/** Moves the anchor one period back or forward. */
export function shiftAnchor(p: Preset, anchor: string, dir: 1 | -1) {
  const d = parseDate(anchor);
  if (p === "daily") return addDays(anchor, dir);
  if (p === "weekly") return addDays(anchor, 7 * dir);
  if (p === "monthly") return isoDate(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  if (p === "quarterly") return isoDate(new Date(d.getFullYear(), d.getMonth() + 3 * dir, 1));
  if (p === "yearly") return isoDate(new Date(d.getFullYear() + dir, 0, 1));
  return anchor;
}

export function periodLabel(p: Preset, r: { from: string; to: string }) {
  if (p === "daily") return fmtDate(r.from, true);
  if (p === "monthly") return monthName(r.from);
  if (p === "quarterly") return `Q${Math.floor(parseDate(r.from).getMonth() / 3) + 1} ${r.from.slice(0, 4)}`;
  if (p === "yearly") return r.from.slice(0, 4);
  return `${fmtDate(r.from)} – ${fmtDate(r.to, true)}`;
}
