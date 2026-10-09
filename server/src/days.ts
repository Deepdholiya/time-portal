// Daily timesheet submission: each person's day is submitted automatically at the company's cutoff, or by hand.
import type { Company } from "@prisma/client";
import { prisma, companySettings, notify } from "./db.js";
import { HttpError } from "./auth.js";
import { addDays, zonedInstant, zonedNow } from "./weeks.js";

/** Days stay editable in these states; SUBMITTED and APPROVED are locked. */
export const OPEN_STATES = ["FAILED", "REJECTED", "REOPENED"];
const LOOKBACK_DAYS = 31;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Today in the company's timezone, and whether today's cutoff has passed. */
export function companyNow(company: Company) {
  const now = zonedNow(company.timezone);
  return { ...now, cutoffPassed: now.time >= companySettings(company).autoSubmitTime };
}

/** Date strings on or before this one have reached their cutoff. */
export function lastDueDate(company: Company) {
  const n = companyNow(company);
  return n.cutoffPassed ? n.date : addDays(n.date, -1);
}

/** What has to be fixed before a day can be submitted, under the company's rules. */
export async function dayProblems(company: Company, userId: number, date: string) {
  const settings = companySettings(company);
  const entries = await prisma.timeEntry.findMany({ where: { companyId: company.id, userId, date, running: false }, include: { tags: true }, orderBy: { startTime: "asc" } });
  const problems: string[] = [];
  if (!entries.length) problems.push("There's no time logged on this day");
  const noDesc = entries.filter((e) => !e.description.trim()).length;
  if (settings.requireDescription && noDesc) problems.push(`${noDesc} ${noDesc === 1 ? "entry needs" : "entries need"} a description`);
  const noTags = entries.filter((e) => !e.tags.length).length;
  if (settings.requireTags && noTags) problems.push(`${noTags} ${noTags === 1 ? "entry needs" : "entries need"} a tag`);
  if (!settings.allowOverlappingTimers) {
    const timed = entries.filter((e) => e.startTime && e.endTime).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
    for (let i = 1; i < timed.length; i++) {
      if (toMin(timed[i].startTime!) < toMin(timed[i - 1].endTime!)) { problems.push(`${timed[i - 1].startTime}–${timed[i - 1].endTime} overlaps ${timed[i].startTime}–${timed[i].endTime}`); break; }
    }
  }
  return problems;
}

/**
 * Submits every day that reached its cutoff and has entries but no submission yet.
 * A day whose entries were changed after its cutoff waits for a manual submit instead, so late additions aren't locked away mid-edit.
 * Runs from the background job and before day statuses are read (serverless deployments have no long-running job).
 */
export async function autoSubmitDue(company: Company, userId?: number) {
  const settings = companySettings(company);
  const last = lastDueDate(company);
  const from = addDays(last, -LOOKBACK_DAYS);
  const groups = await prisma.timeEntry.groupBy({
    by: ["userId", "date"],
    where: { companyId: company.id, running: false, date: { gte: from, lte: last }, ...(userId ? { userId } : {}) },
    _max: { updatedAt: true },
  });
  if (!groups.length) return 0;
  const existing = await prisma.timesheetDay.findMany({ where: { companyId: company.id, date: { gte: from, lte: last }, ...(userId ? { userId } : {}) }, select: { userId: true, date: true } });
  const done = new Set(existing.map((d) => `${d.userId}:${d.date}`));
  let n = 0;
  for (const g of groups) {
    if (done.has(`${g.userId}:${g.date}`)) continue;
    const cutoff = zonedInstant(g.date, settings.autoSubmitTime, company.timezone);
    if (g._max.updatedAt && g._max.updatedAt.getTime() > cutoff.getTime() + 60_000) continue;
    const problems = await dayProblems(company, g.userId, g.date);
    try {
      await prisma.timesheetDay.create({
        data: { companyId: company.id, userId: g.userId, date: g.date, auto: true, status: problems.length ? "FAILED" : "SUBMITTED", note: problems.length ? problems.join(". ") : null },
      });
    } catch { continue; } // another request submitted it first
    n++;
    if (problems.length) {
      await notify([g.userId], {
        companyId: company.id, type: "TIMESHEET_FAILED", title: `Your time for ${g.date} couldn't be submitted`, body: problems.join(". "),
        link: `/timesheet?from=${g.date}&to=${g.date}`, dedupeKey: `dayfail:${g.userId}:${g.date}`,
      });
    }
  }
  return n;
}

/** Submitted and approved days are read-only until the employee reopens them or a reviewer sends them back. */
export async function assertDayOpen(company: Company, userId: number, date: string) {
  const now = companyNow(company);
  if (date > now.date) throw new HttpError(400, "You can't log time on a future date");
  if (!companySettings(company).lockApprovedWeeks) return;
  const d = await prisma.timesheetDay.findUnique({ where: { companyId_userId_date: { companyId: company.id, userId, date } } });
  if (d && !OPEN_STATES.includes(d.status)) {
    throw new HttpError(409, d.status === "APPROVED"
      ? `${date} is approved and locked. Ask your manager or an admin to unlock it.`
      : `${date} is submitted. Reopen the day for corrections to change it.`);
  }
}
