import { Router } from "express";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { HttpError, requirePerm } from "../auth.js";
import { weekEndOf, weekStartOf } from "../weeks.js";

export const timesheetsRouter = Router();
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const canApprove = requirePerm("approveTimesheets", "yes");

const minutesFor = async (userId: number, weekStart: string) =>
  (await prisma.timeEntry.aggregate({ _sum: { minutes: true }, where: { userId, running: false, date: { gte: weekStart, lte: weekEndOf(weekStart) } } }))._sum.minutes ?? 0;

// Status of one week for the caller (or another user when the caller can approve or edit others' time).
timesheetsRouter.get("/", async (req, res) => {
  const q = z.object({ weekStart: DATE, userId: z.coerce.number().int().optional() }).parse(req.query);
  const userId = q.userId ?? req.user!.id;
  if (userId !== req.user!.id && req.perms!.approveTimesheets !== "yes" && req.perms!.editOthersTime !== "yes") throw new HttpError(403, "You don't have access to this");
  const period = await prisma.timesheetPeriod.findUnique({
    where: { userId_weekStart: { userId, weekStart: weekStartOf(q.weekStart) } },
    include: { reviewedBy: { select: { name: true } } },
  });
  res.json(period);
});

timesheetsRouter.post("/submit", async (req, res) => {
  const { weekStart } = z.object({ weekStart: DATE }).parse(req.body);
  const ws = weekStartOf(weekStart);
  const userId = req.user!.id;
  if (await prisma.timeEntry.findFirst({ where: { userId, running: true, date: { gte: ws, lte: weekEndOf(ws) } } })) throw new HttpError(409, "Stop the running timer before submitting this week");
  if (!(await minutesFor(userId, ws))) throw new HttpError(400, "There's no time logged in this week");
  const existing = await prisma.timesheetPeriod.findUnique({ where: { userId_weekStart: { userId, weekStart: ws } } });
  if (existing && existing.status !== "REJECTED") throw new HttpError(409, "This week is already submitted");
  const period = existing
    ? await prisma.timesheetPeriod.update({ where: { id: existing.id }, data: { status: "SUBMITTED", submittedAt: new Date(), note: null, reviewedAt: null, reviewedById: null } })
    : await prisma.timesheetPeriod.create({ data: { userId, weekStart: ws } });
  await audit(userId, "timesheet_submitted", "timesheet", period.id, { weekStart: ws });
  res.json(period);
});

// Withdraw a submission that hasn't been reviewed yet.
timesheetsRouter.post("/withdraw", async (req, res) => {
  const { weekStart } = z.object({ weekStart: DATE }).parse(req.body);
  const p = await prisma.timesheetPeriod.findUnique({ where: { userId_weekStart: { userId: req.user!.id, weekStart: weekStartOf(weekStart) } } });
  if (!p || p.status !== "SUBMITTED") throw new HttpError(409, "Only a submitted week that hasn't been reviewed can be withdrawn");
  await prisma.timesheetPeriod.delete({ where: { id: p.id } });
  await audit(req.user!.id, "timesheet_withdrawn", "timesheet", p.id, { weekStart: p.weekStart });
  res.json({ ok: true });
});

timesheetsRouter.get("/approvals", canApprove, async (req, res) => {
  const q = z.object({ status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).default("SUBMITTED") }).parse(req.query);
  const periods = await prisma.timesheetPeriod.findMany({
    where: { status: q.status, userId: { not: req.user!.id } },
    include: { user: { select: { id: true, name: true, team: { select: { name: true } }, weeklyCapacity: true } }, reviewedBy: { select: { name: true } } },
    orderBy: [{ weekStart: "desc" }, { submittedAt: "asc" }],
    take: 200,
  });
  const out = [];
  for (const p of periods) {
    const entries = await prisma.timeEntry.findMany({
      where: { userId: p.userId, running: false, date: { gte: p.weekStart, lte: weekEndOf(p.weekStart) } },
      select: { minutes: true, billable: true, date: true, project: { select: { name: true, color: true, parent: { select: { name: true, color: true } } } } },
    });
    const byProject = new Map<string, { name: string; color: string; minutes: number }>();
    const byDay: Record<string, number> = {};
    for (const e of entries) {
      const top = e.project.parent ?? e.project;
      const g = byProject.get(top.name) ?? { name: top.name, color: top.color, minutes: 0 };
      g.minutes += e.minutes; byProject.set(top.name, g);
      byDay[e.date] = (byDay[e.date] ?? 0) + e.minutes;
    }
    out.push({
      ...p,
      minutes: entries.reduce((s, e) => s + e.minutes, 0),
      billableMinutes: entries.reduce((s, e) => s + (e.billable ? e.minutes : 0), 0),
      projects: [...byProject.values()].sort((a, b) => b.minutes - a.minutes),
      byDay,
    });
  }
  res.json(out);
});

async function review(id: number, reviewerId: number, status: "APPROVED" | "REJECTED", note?: string) {
  const p = await prisma.timesheetPeriod.findUnique({ where: { id } });
  if (!p) throw new HttpError(404, "Timesheet not found");
  if (p.userId === reviewerId) throw new HttpError(403, "You can't review your own timesheet");
  if (status === "APPROVED" && p.status !== "SUBMITTED") throw new HttpError(409, "Only submitted weeks can be approved");
  const updated = await prisma.timesheetPeriod.update({ where: { id }, data: { status, note: note ?? null, reviewedAt: new Date(), reviewedById: reviewerId } });
  await audit(reviewerId, status === "APPROVED" ? "timesheet_approved" : "timesheet_rejected", "timesheet", id, { userId: p.userId, weekStart: p.weekStart, note });
  return updated;
}

timesheetsRouter.post("/:id/approve", canApprove, async (req, res) => {
  res.json(await review(Number(req.params.id), req.user!.id, "APPROVED"));
});

timesheetsRouter.post("/:id/reject", canApprove, async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(1, "Say what needs fixing").max(1000) }).parse(req.body);
  res.json(await review(Number(req.params.id), req.user!.id, "REJECTED", note));
});
