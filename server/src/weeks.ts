import { prisma, companySettings } from "./db.js";
import { HttpError } from "./auth.js";

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

// Submitted and approved weeks are read-only until a reviewer sends them back or an admin unlocks them.
export async function assertWeekOpen(companyId: number, userId: number, date: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  if (!companySettings(company).lockApprovedWeeks) return;
  const p = await prisma.timesheetPeriod.findUnique({ where: { companyId_userId_weekStart: { companyId, userId, weekStart: weekStartOf(date, company.weekStartsOn) } } });
  if (p && p.status !== "REJECTED") {
    throw new HttpError(409, p.status === "APPROVED" ? "That week is approved and locked. An admin can unlock it with a reason." : "That week is submitted for approval. Withdraw it or ask your manager to send it back to make changes.");
  }
}
