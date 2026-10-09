import { Router } from "express";
import { z } from "zod";
import { prisma, audit, notify, companySettings } from "../db.js";
import { OPEN_STATES, autoSubmitDue, companyNow, dayProblems, lastDueDate } from "../days.js";
import { HttpError, can, cid, requirePerm, uid } from "../auth.js";
import { weekStartOf } from "../weeks.js";
import { DATE, entryInclude, filtersSchema, timeWhere, topProject, subProject, clientOf, teamOf } from "../scope.js";

export const timesheetsRouter = Router();

const ws = (company: { weekStartsOn: number }, d: string) => weekStartOf(d, company.weekStartsOn);

// Day statuses for one person over a range. Days that reached their cutoff are submitted first, so the answer is current.
timesheetsRouter.get("/days", async (req, res) => {
  const q = z.object({ from: DATE, to: DATE, userId: z.coerce.number().int().optional() }).parse(req.query);
  let userId = uid(req);
  if (q.userId && q.userId !== userId) {
    if (!can(req, "timesheetsView", "all")) throw new HttpError(403, "You can only see your own timesheet");
    userId = q.userId;
  }
  await autoSubmitDue(req.company!, userId);
  const [days, totals] = await Promise.all([
    prisma.timesheetDay.findMany({ where: { companyId: cid(req), userId, date: { gte: q.from, lte: q.to } }, include: { reviewedBy: { select: { name: true } } } }),
    prisma.timeEntry.groupBy({ by: ["date"], where: { companyId: cid(req), userId, running: false, date: { gte: q.from, lte: q.to } }, _sum: { minutes: true }, _count: true }),
  ]);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const due = lastDueDate(req.company!);
  const out = totals.map((t) => {
    const d = byDate.get(t.date);
    return {
      date: t.date, minutes: t._sum.minutes ?? 0, entries: t._count,
      status: d?.status ?? "SAVED", note: d?.note ?? null, auto: d?.auto ?? false, submittedAt: d?.submittedAt ?? null,
      reviewedAt: d?.reviewedAt ?? null, reviewedBy: d?.reviewedBy ?? null,
      // Saved after the cutoff: waits for a manual submit.
      overdue: !d && t.date <= due,
    };
  });
  // Days whose entries were all removed keep their review state (e.g. an approved empty correction).
  for (const d of days) if (!out.some((o) => o.date === d.date)) out.push({ date: d.date, minutes: 0, entries: 0, status: d.status, note: d.note, auto: d.auto, submittedAt: d.submittedAt, reviewedAt: d.reviewedAt, reviewedBy: d.reviewedBy, overdue: false });
  res.json({ days: out.sort((a, b) => a.date.localeCompare(b.date)), today: companyNow(req.company!).date, cutoff: companySettings(req.company!).autoSubmitTime });
});

// Submit days by hand: before the cutoff, after fixing a failed or returned day, or after a correction.
timesheetsRouter.post("/days/submit", async (req, res) => {
  const { dates } = z.object({ dates: z.array(DATE).min(1).max(62) }).parse(req.body);
  const userId = uid(req);
  const submitted: string[] = [];
  const failed: { date: string; problems: string[] }[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const key = { companyId_userId_date: { companyId: cid(req), userId, date } };
    const existing = await prisma.timesheetDay.findUnique({ where: key });
    if (existing && !OPEN_STATES.includes(existing.status)) continue;
    const problems = await dayProblems(req.company!, userId, date);
    if (problems.length) { failed.push({ date, problems }); continue; }
    const data = { status: "SUBMITTED", note: null, auto: false, submittedAt: new Date(), reviewedAt: null, reviewedById: null };
    const day = existing ? await prisma.timesheetDay.update({ where: { id: existing.id }, data }) : await prisma.timesheetDay.create({ data: { companyId: cid(req), userId, date, ...data } });
    await audit(req, existing ? "timesheet_resubmitted" : "timesheet_submitted", "timesheetDay", day.id, { old: existing ? { status: existing.status } : undefined, new: { date } });
    submitted.push(date);
  }
  if (!submitted.length && failed.length) throw new HttpError(400, failed.map((f) => `${f.date}: ${f.problems.join(", ")}`).join(". "));
  res.json({ submitted, failed });
});

// Pull a submitted day back to correct it. Approved days need a reviewer to send them back.
timesheetsRouter.post("/days/reopen", async (req, res) => {
  const { date, reason } = z.object({ date: DATE, reason: z.string().trim().max(500).optional() }).parse(req.body);
  const d = await prisma.timesheetDay.findUnique({ where: { companyId_userId_date: { companyId: cid(req), userId: uid(req), date } } });
  if (!d || d.status !== "SUBMITTED") throw new HttpError(409, d?.status === "APPROVED" ? "This day is approved. Ask your manager to send it back for corrections." : "Only a submitted day can be reopened");
  const updated = await prisma.timesheetDay.update({ where: { id: d.id }, data: { status: "REOPENED", note: reason || null } });
  await audit(req, "timesheet_reopened", "timesheetDay", d.id, { old: { status: d.status }, new: { status: "REOPENED", date }, reason });
  res.json(updated);
});

// Submitted days waiting for review, grouped by person and week so a manager approves a week of days in one go.
timesheetsRouter.get("/approvals", requirePerm("approveTimesheets", "yes"), async (req, res) => {
  const q = z.object({ status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).default("SUBMITTED") }).parse(req.query);
  await autoSubmitDue(req.company!);
  const days = await prisma.timesheetDay.findMany({
    where: { companyId: cid(req), status: q.status, userId: { not: uid(req) } },
    include: { user: { select: { id: true, name: true, weeklyCapacity: true, memberships: { where: { companyId: cid(req) }, select: { team: { select: { name: true } } } } } }, reviewedBy: { select: { name: true } } },
    orderBy: [{ date: "desc" }],
    take: 1000,
  });
  const groups = new Map<string, { key: string; weekStart: string; status: string; dates: string[]; note: string | null; submittedAt: Date; reviewedAt: Date | null; reviewedBy: { name: string } | null; userId: number; user: typeof days[number]["user"] }>();
  for (const d of days) {
    const start = ws(req.company!, d.date);
    const key = `${d.userId}:${start}`;
    let g = groups.get(key);
    if (!g) { g = { key, weekStart: start, status: d.status, dates: [], note: null, submittedAt: d.submittedAt, reviewedAt: d.reviewedAt, reviewedBy: d.reviewedBy, userId: d.userId, user: d.user }; groups.set(key, g); }
    g.dates.push(d.date);
    if (d.note) g.note = g.note ? `${g.note} · ${d.date}: ${d.note}` : `${d.date}: ${d.note}`;
    if (d.submittedAt < g.submittedAt) g.submittedAt = d.submittedAt;
  }
  const out = [];
  for (const g of [...groups.values()].slice(0, 200)) {
    const entries = await prisma.timeEntry.findMany({
      where: { companyId: cid(req), userId: g.userId, running: false, date: { in: g.dates } },
      select: { minutes: true, billable: true, date: true, project: { select: { name: true, color: true, parent: { select: { name: true, color: true } } } } },
    });
    const byProject = new Map<string, { name: string; color: string; minutes: number }>();
    const byDay: Record<string, number> = {};
    for (const e of entries) {
      const top = e.project.parent ?? e.project;
      const p = byProject.get(top.name) ?? { name: top.name, color: top.color, minutes: 0 };
      p.minutes += e.minutes; byProject.set(top.name, p);
      byDay[e.date] = (byDay[e.date] ?? 0) + e.minutes;
    }
    out.push({
      ...g, dates: g.dates.sort(),
      user: { id: g.user.id, name: g.user.name, weeklyCapacity: g.user.weeklyCapacity, team: g.user.memberships[0]?.team ?? null },
      minutes: entries.reduce((s, e) => s + e.minutes, 0),
      billableMinutes: entries.reduce((s, e) => s + (e.billable ? e.minutes : 0), 0),
      projects: [...byProject.values()].sort((a, b) => b.minutes - a.minutes),
      byDay,
    });
  }
  res.json(out);
});

async function review(req: Parameters<typeof cid>[0], userId: number, dates: string[], status: "APPROVED" | "REJECTED", note?: string) {
  if (userId === uid(req)) throw new HttpError(403, "You can't review your own timesheet");
  const days = await prisma.timesheetDay.findMany({ where: { companyId: cid(req), userId, date: { in: dates } } });
  if (!days.length) throw new HttpError(404, "Those days aren't submitted");
  let n = 0;
  for (const d of days) {
    if (status === "APPROVED" && d.status !== "SUBMITTED") continue;
    // Reopening an approved day is an unlock: admins only, with a reason.
    if (status === "REJECTED" && d.status === "APPROVED" && req.user!.role !== "ADMIN") throw new HttpError(403, "Only an admin can unlock an approved day");
    if (status === "REJECTED" && !["SUBMITTED", "APPROVED"].includes(d.status)) continue;
    await prisma.timesheetDay.update({ where: { id: d.id }, data: { status, note: note ?? null, reviewedAt: new Date(), reviewedById: uid(req) } });
    const action = status === "APPROVED" ? "timesheet_approved" : d.status === "APPROVED" ? "timesheet_unlocked" : "timesheet_rejected";
    await audit(req, action, "timesheetDay", d.id, { old: { status: d.status }, new: { status, userId, date: d.date }, reason: note });
    n++;
  }
  if (!n) throw new HttpError(409, status === "APPROVED" ? "Only submitted days can be approved" : "Nothing to send back");
  const sorted = [...dates].sort();
  const span = sorted.length > 1 ? `${sorted[0]} to ${sorted.at(-1)}` : sorted[0];
  await notify([userId], {
    companyId: cid(req), type: status === "APPROVED" ? "TIMESHEET_APPROVED" : "TIMESHEET_REJECTED",
    title: status === "APPROVED" ? `Your time for ${span} was approved` : `Your time for ${span} needs corrections`,
    body: note, link: `/timesheet?from=${sorted[0]}&to=${sorted.at(-1)}`,
  });
  return n;
}

const reviewSchema = z.object({ userId: z.number().int(), dates: z.array(DATE).min(1).max(62) });

timesheetsRouter.post("/approve", requirePerm("approveTimesheets", "yes"), async (req, res) => {
  const d = reviewSchema.parse(req.body);
  res.json({ approved: await review(req, d.userId, d.dates, "APPROVED") });
});

timesheetsRouter.post("/reject", requirePerm("approveTimesheets", "yes"), async (req, res) => {
  const d = reviewSchema.extend({ note: z.string().trim().min(1, "Say what needs fixing, or why you're unlocking it").max(1000) }).parse(req.body);
  res.json({ rejected: await review(req, d.userId, d.dates, "REJECTED", d.note) });
});

timesheetsRouter.post("/bulk-approve", requirePerm("approveTimesheets", "yes"), async (req, res) => {
  const { groups } = z.object({ groups: z.array(reviewSchema).min(1).max(200) }).parse(req.body);
  let done = 0;
  for (const g of groups) { try { await review(req, g.userId, g.dates, "APPROVED"); done++; } catch { /* skip */ } }
  res.json({ approved: done });
});

// Combined timesheet for managers and admins: rows by employee or project, columns by day.
timesheetsRouter.get("/combined", requirePerm("timesheetsView", "all"), async (req, res) => {
  const f = filtersSchema.parse(req.query);
  const { groupBy } = z.object({ groupBy: z.enum(["employee", "project", "client", "subProject", "task"]).default("employee") }).parse(req.query);
  const entries = await prisma.timeEntry.findMany({ where: timeWhere(req, f, "all"), include: entryInclude, orderBy: [{ date: "asc" }] });
  type Row = { key: string; label: string; color?: string; sub?: string; days: Record<string, number>; minutes: number; billableMinutes: number; entries: number; userId?: number };
  const rows = new Map<string, Row>();
  for (const e of entries) {
    const top = topProject(e), sp = subProject(e), cl = clientOf(e);
    const [key, label, color, sub] =
      groupBy === "employee" ? [`u${e.user.id}`, e.user.name, undefined, teamOf(e, cid(req))?.name]
      : groupBy === "project" ? [`p${top.id}`, top.name, top.color, cl?.name]
      : groupBy === "subProject" ? [`s${sp?.id ?? top.id}`, sp ? `${top.name} › ${sp.name}` : top.name, top.color, cl?.name]
      : groupBy === "client" ? [`c${cl?.id ?? 0}`, cl?.name ?? "No client", undefined, undefined]
      : [`t${e.task?.id ?? 0}`, e.task ? e.task.title : "No task", top.color, top.name];
    let r = rows.get(key);
    if (!r) { r = { key, label, color, sub, days: {}, minutes: 0, billableMinutes: 0, entries: 0, userId: groupBy === "employee" ? e.user.id : undefined }; rows.set(key, r); }
    r.days[e.date] = (r.days[e.date] ?? 0) + e.minutes;
    r.minutes += e.minutes;
    if (e.billable) r.billableMinutes += e.minutes;
    r.entries++;
  }
  const days = groupBy === "employee"
    ? await prisma.timesheetDay.findMany({ where: { companyId: cid(req), date: { gte: f.from, lte: f.to } }, select: { userId: true, date: true, status: true } })
    : [];
  res.json({ rows: [...rows.values()].sort((a, b) => b.minutes - a.minutes), days, total: entries.reduce((s, e) => s + e.minutes, 0) });
});
