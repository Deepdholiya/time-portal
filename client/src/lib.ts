export const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const parseISO = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = (d: Date) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x; };

export const fmtHours = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return `${h}:${pad(m)}`;
};
export const fmtH = (minutes: number, digits = 1) => `${(minutes / 60).toFixed(digits)}h`;
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
export const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => parseISO(iso).toLocaleDateString(undefined, opts);
export const fmtDate = (iso?: string | null) => (iso ? parseISO(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

// Parses "1:30", "1.5", "90m", "2h" into minutes.
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d+):([0-5]\d)$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*h?$/))) return Math.round(Number(m[1]) * 60);
  if ((m = t.match(/^(\d+)\s*m$/))) return Number(m[1]);
  if ((m = t.match(/^(\d+)\s*h\s*(\d+)\s*m?$/))) return Number(m[1]) * 60 + Number(m[2]);
  return null;
}

export const STATUS_LABEL: Record<string, string> = { PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" };
export const HEALTH_LABEL: Record<string, string> = { ON_TRACK: "On track", AT_RISK: "At risk", DELAYED: "Delayed" };
export const TASK_LABEL: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" };

// Validated categorical palette (fixed order) used for project identity colours.
export const PROJECT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948", "#898781"];
