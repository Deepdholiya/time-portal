import type { Request } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, parseJson } from "./db.js";
import { HttpError, can, cid, uid } from "./auth.js";

export const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const ids = z.union([z.coerce.number().int(), z.string()]).optional().transform((v) =>
  v === undefined || v === "" ? undefined : String(v).split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0));

// Global filters shared by dashboards, analytics, reports, exports and combined timesheets.
export const filtersSchema = z.object({
  from: DATE,
  to: DATE,
  clientId: ids, projectId: ids, subProjectId: ids, teamId: ids, userId: ids, taskId: ids, managerId: ids, milestoneId: ids,
  billable: z.enum(["true", "false"]).optional().or(z.literal("").transform(() => undefined)),
  status: z.string().optional(), priority: z.string().optional(), tag: z.string().optional(),
  q: z.string().optional(),
});
export type Filters = z.infer<typeof filtersSchema>;

// Time-entry where clause for the filters, inside the current company, narrowed to the caller when their level is "own".
export function timeWhere(req: Request, f: Filters, level: "own" | "all"): Prisma.TimeEntryWhereInput {
  const and: Prisma.TimeEntryWhereInput[] = [{ companyId: cid(req) }, { date: { gte: f.from, lte: f.to } }, { running: false }];
  if (level === "own") and.push({ userId: uid(req) });
  else if (f.userId) and.push({ userId: { in: f.userId } });
  if (f.teamId) and.push({ user: { memberships: { some: { companyId: cid(req), teamId: { in: f.teamId } } } } });
  if (f.subProjectId) and.push({ projectId: { in: f.subProjectId } });
  else if (f.projectId) and.push({ OR: [{ projectId: { in: f.projectId } }, { project: { parentId: { in: f.projectId } } }] });
  if (f.clientId) and.push({ OR: [{ project: { clientId: { in: f.clientId } } }, { project: { parent: { clientId: { in: f.clientId } } } }] });
  if (f.managerId) and.push({ OR: [{ project: { managerId: { in: f.managerId } } }, { project: { parent: { managerId: { in: f.managerId } } } }] });
  if (f.taskId) and.push({ taskId: { in: f.taskId } });
  if (f.milestoneId) and.push({ task: { milestoneId: { in: f.milestoneId } } });
  if (f.status) and.push({ task: { status: { in: f.status.split(",") } } });
  if (f.priority) and.push({ task: { priority: { in: f.priority.split(",") } } });
  if (f.tag) and.push({ OR: [{ tags: { some: { tag: { name: f.tag } } } }, { task: { tags: { contains: `"${f.tag}"` } } }, { project: { tags: { contains: `"${f.tag}"` } } }] });
  if (f.billable) and.push({ billable: f.billable === "true" });
  if (f.q) and.push({ description: { contains: f.q } });
  return { AND: and };
}

export const entryInclude = {
  user: { select: { id: true, name: true, email: true, weeklyCapacity: true, costRate: true, billRate: true, memberships: { select: { companyId: true, team: { select: { id: true, name: true } } } } } },
  project: {
    select: {
      id: true, name: true, color: true, estimatedHours: true, hourlyRate: true, budget: true, billingType: true, parentId: true, tags: true,
      client: { select: { id: true, name: true, rate: true } }, manager: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, color: true, estimatedHours: true, hourlyRate: true, budget: true, billingType: true, client: { select: { id: true, name: true, rate: true } }, manager: { select: { id: true, name: true } } } },
    },
  },
  task: { select: { id: true, number: true, title: true, status: true, priority: true, estimateHours: true, milestone: { select: { id: true, name: true } } } },
} satisfies Prisma.TimeEntryInclude;

export type RichEntry = Prisma.TimeEntryGetPayload<{ include: typeof entryInclude }>;

export const topProject = (e: RichEntry) => e.project.parent ?? e.project;
export const subProject = (e: RichEntry) => (e.project.parent ? e.project : null);
export const clientOf = (e: RichEntry) => e.project.client ?? e.project.parent?.client ?? null;
export const teamOf = (e: RichEntry, companyId: number) => e.user.memberships.find((m) => m.companyId === companyId)?.team ?? null;

// Hourly bill rate for an entry: sub-project, project, client, then the person's default rate.
// Fixed-fee projects spread the budget over the estimated hours.
export function billRate(e: RichEntry) {
  const p = e.project, top = topProject(e);
  const type = p.parent ? p.parent.billingType : p.billingType;
  if (type === "NON_BILLABLE") return 0;
  if (type === "FIXED") {
    const budget = top.budget ?? 0, est = top.estimatedHours ?? 0;
    return est > 0 ? budget / est : 0;
  }
  return p.hourlyRate ?? p.parent?.hourlyRate ?? clientOf(e)?.rate ?? e.user.billRate ?? 0;
}

export function money(e: RichEntry) {
  const hours = e.minutes / 60;
  const revenue = e.billable ? hours * billRate(e) : 0;
  const cost = hours * (e.user.costRate ?? 0);
  return { revenue, cost };
}

// Analytics access for this request: "own" or "all". Throws when analytics is off.
export function analyticsLevel(req: Request, feature: "analytics" | "export" = "analytics"): "own" | "all" {
  const lvl = req.perms![feature];
  if (lvl === "none") throw new HttpError(403, "You don't have access to this");
  return lvl as "own" | "all";
}

export async function loadEntries(req: Request, f: Filters, level: "own" | "all", take?: number) {
  return prisma.timeEntry.findMany({
    where: timeWhere(req, f, level),
    include: entryInclude,
    orderBy: [{ date: "desc" }, { startTime: "desc" }, { id: "desc" }],
    take,
  });
}

export const canSeeFinancials = (req: Request) => can(req, "financials", "view");
export const tagsOf = (s: string | null | undefined) => parseJson<string[]>(s, []);
