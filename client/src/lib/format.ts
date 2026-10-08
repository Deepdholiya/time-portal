// Formatting helpers shared by every page. Dates are plain "YYYY-MM-DD" strings in the API.
export const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const parseDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 864e5);
/** ISO weekday, Monday = 1 … Sunday = 7 */
export const weekday = (s: string) => ((parseDate(s).getDay() + 6) % 7) + 1;
export const weekStart = (s: string, startsOn = 1) => addDays(s, -((weekday(s) - startsOn + 7) % 7));
export const monthStart = (s: string) => s.slice(0, 8) + "01";
export const monthEnd = (s: string) => { const d = parseDate(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return isoDate(d); };
export const range = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const fmtDate = (s?: string | null, withYear = false) => {
  if (!s) return "";
  const d = parseDate(s.slice(0, 10));
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${withYear || d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ""}`;
};
export const fmtDay = (s: string) => { const d = parseDate(s); return `${DAYS[d.getDay()]} ${d.getDate()}`; };
export const dayName = (s: string) => DAYS[parseDate(s).getDay()];
export const monthName = (s: string) => { const d = parseDate(s); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const relTime = (iso?: string | null) => {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return fmtDate(new Date(iso).toISOString().slice(0, 10));
};
/** Relative label for a due date: "Today", "Tomorrow", "3d overdue", "Oct 12" */
export const dueLabel = (s?: string | null) => {
  if (!s) return "";
  const n = daysBetween(today(), s);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n}d overdue`;
  return fmtDate(s);
};

/** Minutes → "7h 30m" (or "7:30" with clock=true) */
export const hm = (min?: number | null, clock = false) => {
  const m = Math.round(min ?? 0);
  const h = Math.floor(Math.abs(m) / 60), r = Math.abs(m) % 60, sign = m < 0 ? "-" : "";
  if (clock) return `${sign}${h}:${pad(r)}`;
  if (!h) return `${sign}${r}m`;
  return r ? `${sign}${h}h ${r}m` : `${sign}${h}h`;
};
/** Minutes → decimal hours "7.5" */
export const hours = (min?: number | null, digits = 1) => ((min ?? 0) / 60).toFixed(digits).replace(/\.0+$/, "");
/** Seconds → "01:02:03" for running timers */
export const clock = (sec: number) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(Math.floor(sec % 60))}`;
/** Parses "1:30", "1h 30m", "1.5", "90m" into minutes */
export const parseDuration = (s: string): number | null => {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/);
  if (m && (m[1] || m[2])) return Math.round(parseFloat(m[1] ?? "0") * 60 + +(m[2] ?? 0));
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60);
  return null;
};
export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export const pct = (n?: number | null, digits = 0) => `${((n ?? 0) * 100).toFixed(digits)}%`;
export function money(n?: number | null, currency = "INR") {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}
export const initials = (name?: string | null) => (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const titleCase = (s?: string | null) => (s ?? "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
