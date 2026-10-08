import { addDays, daysBetween, isoDate, parseDate } from "@/lib/format";

export type Zoom = "day" | "week" | "2week" | "month" | "quarter" | "half" | "year";
export const ZOOMS: { value: Zoom; label: string; title: string }[] = [
  { value: "day", label: "Day", title: "Date-wise: one column per day" },
  { value: "week", label: "Week", title: "Week-wise: one column per week" },
  { value: "2week", label: "2W", title: "Two-week sprints" },
  { value: "month", label: "Month", title: "Weeks grouped by month" },
  { value: "quarter", label: "Quarter", title: "Months grouped by quarter" },
  { value: "half", label: "6M", title: "Six months" },
  { value: "year", label: "Year", title: "Months grouped by year" },
];
export const PX_PER_DAY: Record<Zoom, number> = { day: 44, week: 16, "2week": 9, month: 5, quarter: 2.4, half: 1.6, year: 0.9 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** ISO-8601 week number. */
export function isoWeek(s: string) {
  const d = parseDate(s);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7);
}

export interface Tick { x: number; w: number; label: string; strong?: boolean; weekend?: boolean }

const monthStartOf = (s: string) => s.slice(0, 8) + "01";
const nextMonth = (s: string) => { const d = parseDate(monthStartOf(s)); d.setMonth(d.getMonth() + 1); return isoDate(d); };
const mondayOf = (s: string) => addDays(s, -((parseDate(s).getDay() + 6) % 7));

/** Two header tiers (top: months/quarters/years, bottom: days/weeks/months) for a zoom level. */
export function headerTicks(zoom: Zoom, start: string, end: string) {
  const ppd = PX_PER_DAY[zoom];
  const x = (d: string) => daysBetween(start, d) * ppd;
  const top: Tick[] = [];
  const bottom: Tick[] = [];
  const clampW = (a: string, b: string) => Math.max(0, x(b < end ? b : addDays(end, 1)) - Math.max(0, x(a)));

  const yearly = zoom === "half" || zoom === "year" || zoom === "quarter";
  if (!yearly) {
    for (let m = monthStartOf(start); m <= end; m = nextMonth(m)) {
      const d = parseDate(m);
      top.push({ x: Math.max(0, x(m)), w: clampW(m, nextMonth(m)), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
    }
  } else {
    for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
      if (zoom === "year") { const a = `${y}-01-01`, b = `${y + 1}-01-01`; top.push({ x: Math.max(0, x(a)), w: clampW(a, b), label: String(y) }); continue; }
      for (let q = 0; q < 4; q++) {
        const a = isoDate(new Date(y, q * 3, 1)), b = isoDate(new Date(y, q * 3 + 3, 1));
        if (b <= start || a > end) continue;
        top.push({ x: Math.max(0, x(a)), w: clampW(a, b), label: `Q${q + 1} ${y}` });
      }
    }
  }

  if (zoom === "day") {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const dt = parseDate(d);
      bottom.push({ x: x(d), w: ppd, label: `${DAYS[dt.getDay()]} ${dt.getDate()}`, weekend: dt.getDay() === 0 || dt.getDay() === 6, strong: dt.getDay() === 1 });
    }
  } else if (zoom === "week" || zoom === "2week" || zoom === "month") {
    const step = zoom === "2week" ? 14 : 7;
    for (let d = mondayOf(start); d <= end; d = addDays(d, step)) {
      const dt = parseDate(d);
      const label = zoom === "month" ? `W${isoWeek(d)}` : `W${isoWeek(d)} · ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
      bottom.push({ x: Math.max(0, x(d)), w: step * ppd, label });
    }
  } else {
    for (let m = monthStartOf(start); m <= end; m = nextMonth(m)) {
      const dt = parseDate(m);
      bottom.push({ x: Math.max(0, x(m)), w: clampW(m, nextMonth(m)), label: zoom === "year" ? MONTHS[dt.getMonth()].slice(0, 1) : MONTHS[dt.getMonth()] });
    }
  }
  return { top, bottom };
}
