
const D = (s: string) => new Date(s + "T00:00:00Z");
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 864e5);
export const weekday = (s: string) => { const w = D(s).getUTCDay(); return w === 0 ? 7 : w; }; // ISO 1..7

// First day of the week containing `date`, using the company's week start (1 = Monday ... 7 = Sunday).
export function weekStartOf(date: string, startsOn = 1) {
  const diff = (weekday(date) - startsOn + 7) % 7;
  return addDays(date, -diff);
}
export const weekEndOf = (weekStart: string) => addDays(weekStart, 6);

export function workingDays(from: string, to: string, workWeek: string, holidays: Set<string> = new Set()) {
  const days = new Set(workWeek.split(",").map(Number));
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (days.has(weekday(d)) && !holidays.has(d)) n++;
  return n;
}

/** Today's date and the time of day in a timezone, as "YYYY-MM-DD" and "HH:MM". */
export function zonedNow(timeZone: string, at = new Date()) {
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at); }
  catch { return zonedNow("UTC", at); }
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}` };
}

/** The instant a local date and time in a timezone happens. */
export function zonedInstant(date: string, time: string, timeZone: string) {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5));
  // Offset of the zone at that moment: what the local clock shows minus UTC.
  const shown = zonedNow(timeZone, new Date(guess));
  const local = Date.UTC(+shown.date.slice(0, 4), +shown.date.slice(5, 7) - 1, +shown.date.slice(8, 10), +shown.time.slice(0, 2), +shown.time.slice(3, 5));
  return new Date(guess - (local - guess));
}
