import { prisma } from "./db.js";
import { HttpError } from "./auth.js";

// Monday of the week containing an ISO date (YYYY-MM-DD).
export function weekStartOf(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function weekEndOf(weekStart: string) {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

// Submitted and approved weeks are read-only until a reviewer sends them back.
export async function assertWeekOpen(userId: number, date: string) {
  const p = await prisma.timesheetPeriod.findUnique({ where: { userId_weekStart: { userId, weekStart: weekStartOf(date) } } });
  if (p && p.status !== "REJECTED") {
    throw new HttpError(409, p.status === "APPROVED" ? "That week is approved and locked" : "That week is submitted for approval. Ask your manager to send it back to make changes");
  }
}
