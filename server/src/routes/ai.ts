// AI helpers across the portal: drafting task and time descriptions, tidying expense claims, and short summaries of a project,
// a report or the person's day. Each one uses Claude when ANTHROPIC_API_KEY is set and falls back to a deterministic writer
// built from the same facts, so the button always returns something useful.
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma, audit, companySettings } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { projectStats } from "../health.js";
import { addDays, weekday, zonedNow } from "../weeks.js";
import { assertDayOpen } from "../days.js";
import { PERIODS, aiAllowed, claude, claudeChat, periodRange } from "./misc.js";
import { CATEGORIES } from "./reimbursements.js";

export const aiToolsRouter = Router();

type Source = "claude" | "template";
const src = (ai: string | null): Source => (ai ? "claude" : "template");

function guard(req: Request) {
  if (!can(req, "aiAssist", "yes")) throw new HttpError(403, "AI isn't available for your account");
  aiAllowed(req);
}

const hrs = (m: number) => { if (m >= 20 * 60) return `${Math.round(m / 60)}h`; const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };
const lower = (s: string) => s.replace(/_/g, " ").toLowerCase();
const companyToday = (req: Request) => zonedNow(req.company!.timezone).date;

async function visibleProject(req: Request, projectId: number) {
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const p = await prisma.project.findFirst({ where: { id: projectId, companyId: cid(req) }, include: { parent: { select: { id: true, name: true } }, children: { select: { id: true } } } });
  if (!p || (ids !== "all" && !ids.includes(p.id) && !(p.parentId && ids.includes(p.parentId)))) throw new HttpError(404, "Project not found");
  return p;
}

// ---------- New task: description and checklist from the title ----------
const TASK_KINDS: [RegExp, string[]][] = [
  [/\b(bug|fix|error|crash|broken|issue|regression)\b/i, ["Reproduce the problem and note the steps", "Find the root cause", "Make the fix", "Add or update a test that covers it", "Check it in staging and close the loop with whoever reported it"]],
  [/\b(design|mockup|wireframe|ui|ux|layout)\b/i, ["Collect requirements and references", "Sketch options", "Review with the team", "Polish the chosen direction", "Hand off specs and assets"]],
  [/\b(test|qa|verify|regression)\b/i, ["List the scenarios to cover", "Prepare test data", "Run the tests and record results", "File issues for anything that fails"]],
  [/\b(doc|docs|document|write|guide|readme|spec)\b/i, ["Outline the sections", "Write the first draft", "Get a review", "Publish and share the link"]],
  [/\b(meeting|workshop|call|review|demo|kickoff)\b/i, ["Set the agenda and invite people", "Prepare material", "Run the session", "Share notes and follow-ups"]],
  [/\b(deploy|release|launch|migrate|migration|upgrade)\b/i, ["Write the rollout plan", "Back up and prepare a rollback", "Run it in staging", "Release to production", "Monitor and confirm"]],
  [/\b(research|investigate|explore|evaluate|spike)\b/i, ["Define the question and what a good answer looks like", "Gather options", "Compare them", "Write up a recommendation"]],
];

aiToolsRouter.post("/task-draft", async (req, res) => {
  guard(req);
  const d = z.object({ title: z.string().trim().min(3, "Write a task title first").max(200), projectId: z.number().int().nullable().optional() }).parse(req.body);
  const project = d.projectId ? await visibleProject(req, d.projectId) : null;
  const facts = { title: d.title, project: project ? (project.parent ? `${project.parent.name} › ${project.name}` : project.name) : null, projectDescription: project?.description?.slice(0, 1200) ?? null };
  const ai = await claude(
    "You draft the description for a new task in a project management tool. Write one or two plain sentences on the goal, then a blank line, then 'Checklist:' and 3 to 6 short steps, each on its own line starting with '- '. No markdown headings, no bold. Use only the given facts; don't invent names, dates or numbers.",
    JSON.stringify(facts),
  );
  const steps = TASK_KINDS.find(([re]) => re.test(d.title))?.[1] ?? ["Confirm the scope and what done looks like", "Do the work", "Get it reviewed", "Wrap up and update the team"];
  const fallback = `Goal: ${d.title.replace(/[.\s]+$/, "")}${facts.project ? ` for ${facts.project}` : ""}.\n\nChecklist:\n${steps.map((x) => `- ${x}`).join("\n")}`;
  await audit(req, "ai_task_drafted", "project", project?.id ?? null, { new: { title: d.title, source: src(ai) } });
  res.json({ description: ai ?? fallback, source: src(ai), aiGenerated: true });
});

// ---------- Time entry: description from the project, task and duration ----------
aiToolsRouter.post("/time-description", async (req, res) => {
  guard(req);
  const d = z.object({ projectId: z.number().int(), taskId: z.number().int().nullable().optional(), minutes: z.number().int().min(0).max(24 * 60).optional(), draft: z.string().max(500).optional() }).parse(req.body);
  const project = await visibleProject(req, d.projectId);
  const task = d.taskId ? await prisma.task.findFirst({ where: { id: d.taskId, companyId: cid(req) }, select: { title: true, status: true, description: true, subtasks: { select: { title: true, status: true } } } }) : null;
  // A draft that's just the task's title (the editor pre-fills it) is no draft at all.
  if (task && d.draft && d.draft.trim().toLowerCase() === task.title.trim().toLowerCase()) d.draft = undefined;
  const recent = await prisma.timeEntry.findMany({
    where: { companyId: cid(req), userId: uid(req), projectId: d.projectId, ...(d.taskId ? { taskId: d.taskId } : {}), description: { not: "" } },
    select: { description: true }, orderBy: { date: "desc" }, take: 5,
  });
  const facts = {
    project: project.parent ? `${project.parent.name} › ${project.name}` : project.name, task: task?.title ?? null, taskStatus: task?.status ?? null,
    taskDescription: task?.description?.slice(0, 800) ?? null, subtasks: task?.subtasks.slice(0, 12) ?? [], duration: d.minutes ? hrs(d.minutes) : null,
    myRecentDescriptions: recent.map((r) => r.description), currentDraft: d.draft?.trim() || null,
  };
  const ai = await claude(
    "Write a one-line description for a time entry in a timesheet: what the person worked on, in past tense, under 120 characters, no trailing period, no quotes. If there is a current draft, tidy it up instead of replacing its meaning. Match the style of their recent descriptions. Use only the facts given.",
    JSON.stringify(facts),
  );
  let fallback: string;
  if (d.draft?.trim()) {
    const t = d.draft.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
    fallback = t.charAt(0).toUpperCase() + t.slice(1);
  } else if (task) {
    const verb = task.status === "IN_REVIEW" ? "Reviewed and addressed feedback on" : task.status === "DONE" ? "Wrapped up" : task.status === "TODO" || task.status === "BACKLOG" ? "Started on" : "Worked on";
    fallback = `${verb} ${task.title}`;
  } else {
    fallback = recent[0]?.description ?? `Worked on ${project.name}`;
  }
  await audit(req, "ai_time_description", "project", project.id, { new: { taskId: d.taskId ?? null, source: src(ai) } });
  res.json({ description: (ai ?? fallback).slice(0, 500), source: src(ai), aiGenerated: true });
});

// ---------- Reimbursement: tidy the description and suggest a category ----------
const CATEGORY_WORDS: [(typeof CATEGORIES)[number], RegExp][] = [
  ["TRAVEL", /\b(cab|taxi|uber|lyft|ola|flight|train|bus|metro|fuel|petrol|gas|parking|toll|hotel|airbnb|travel|mileage|ticket)\b/i],
  ["MEALS", /\b(lunch|dinner|breakfast|meal|food|coffee|snack|restaurant|team meal|catering)\b/i],
  ["SOFTWARE", /\b(software|license|licence|subscription|saas|app|plugin|domain|hosting|cloud|figma|github|adobe|notion|slack)\b/i],
  ["SUPPLIES", /\b(supplies|stationery|paper|printer|ink|cable|charger|keyboard|mouse|monitor|headset|equipment|hardware|courier|postage)\b/i],
];

aiToolsRouter.post("/reimbursement-tidy", async (req, res) => {
  guard(req);
  const d = z.object({ description: z.string().trim().min(3, "Describe the expense first").max(500), amount: z.number().nonnegative().optional(), category: z.string().optional(), projectId: z.number().int().nullable().optional() }).parse(req.body);
  const project = d.projectId ? await visibleProject(req, d.projectId).catch(() => null) : null;
  const ai = await claude(
    `You tidy an expense reimbursement description so an approver understands it at a glance: what was bought, why, and for which client or project if given. One sentence, under 160 characters, no trailing period. Then on a new line write 'Category: ' and exactly one of ${CATEGORIES.join(", ")}. Use only the facts given.`,
    JSON.stringify({ description: d.description, amount: d.amount ?? null, currency: req.company!.currency, project: project?.name ?? null }),
  );
  let description: string, category: string;
  const fromAi = ai?.match(/^([\s\S]*?)\n+\s*Category:\s*([A-Z]+)/i);
  if (ai && fromAi && (CATEGORIES as readonly string[]).includes(fromAi[2].toUpperCase())) {
    description = fromAi[1].trim().replace(/^"|"$/g, "");
    category = fromAi[2].toUpperCase();
  } else {
    const t = d.description.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
    description = t.charAt(0).toUpperCase() + t.slice(1) + (project && !t.toLowerCase().includes(project.name.toLowerCase()) ? ` (${project.name})` : "");
    category = CATEGORY_WORDS.find(([, re]) => re.test(d.description))?.[0] ?? "OTHER";
  }
  const source: Source = ai && fromAi ? "claude" : "template";
  await audit(req, "ai_reimbursement_tidied", "reimbursement", null, { new: { category, source } });
  res.json({ description: description.slice(0, 500), category, source, aiGenerated: true });
});

// ---------- Project: short status summary ----------
aiToolsRouter.post("/project-summary", async (req, res) => {
  guard(req);
  const { projectId } = z.object({ projectId: z.number().int() }).parse(req.body);
  const p = await visibleProject(req, projectId);
  const t0 = companyToday(req);
  const scope = [p.id, ...p.children.map((c) => c.id)];
  const [tasks, minutes, milestones] = await Promise.all([
    prisma.task.findMany({ where: { companyId: cid(req), projectId: { in: scope } }, select: { title: true, status: true, dueDate: true, priority: true, completedAt: true, assignee: { select: { name: true } }, blockedBy: { select: { blocker: { select: { status: true } } } } } }),
    prisma.timeEntry.aggregate({ where: { companyId: cid(req), projectId: { in: scope }, running: false }, _sum: { minutes: true } }),
    prisma.milestone.findMany({ where: { projectId: p.id }, select: { name: true, date: true, done: true }, orderBy: { date: "asc" } }),
  ]);
  const stats = p.parentId ? null : (await projectStats(cid(req), [p.id])).get(p.id) ?? null;
  const open = tasks.filter((t) => t.status !== "DONE");
  const overdue = open.filter((t) => t.dueDate && t.dueDate < t0).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
  const blocked = open.filter((t) => t.status === "BLOCKED" || t.blockedBy.some((b) => b.blocker.status !== "DONE"));
  const doneRecently = tasks.filter((t) => t.status === "DONE" && t.completedAt && t.completedAt.toISOString().slice(0, 10) >= addDays(t0, -7));
  const dueSoon = open.filter((t) => t.dueDate && t.dueDate >= t0 && t.dueDate <= addDays(t0, 7));
  const tracked = minutes._sum.minutes ?? 0;
  const estimate = p.estimatedHours ?? (stats?.tasks.estimateHours || null);
  const missed = milestones.filter((m) => !m.done && m.date < t0);
  const next = milestones.find((m) => !m.done && m.date >= t0);
  const facts = {
    project: p.name, status: p.status, endDate: p.endDate, health: stats?.health ?? null, healthReasons: stats?.reasons ?? [],
    tasks: { total: tasks.length, done: tasks.length - open.length, open: open.length, overdue: overdue.length, blocked: blocked.length, dueInNext7Days: dueSoon.length, completedLast7Days: doneRecently.length },
    overdueTasks: overdue.slice(0, 5).map((t) => ({ title: t.title, due: t.dueDate, assignee: t.assignee?.name ?? null })),
    trackedHours: Math.round(tracked / 6) / 10, estimatedHours: estimate, missedMilestones: missed.map((m) => ({ name: m.name, date: m.date })), nextMilestone: next ?? null,
  };
  const ai = await claude(
    "You write a short status summary of a project for its team. 3 to 5 short bullet lines starting with '• ': progress, schedule (overdue tasks, milestones), hours against the estimate, and the main risk with a suggested next step. Plain text, no markdown headings. Use only the JSON facts; don't invent anything.",
    JSON.stringify(facts),
  );
  const pct = tasks.length ? Math.round(((tasks.length - open.length) / tasks.length) * 100) : 0;
  const lines = [
    `• ${tasks.length ? `${pct}% of tasks done (${tasks.length - open.length} of ${tasks.length})` : "No tasks yet"}${doneRecently.length ? `, ${doneRecently.length} finished in the last week` : ""}.`,
    overdue.length ? `• ${overdue.length} overdue: ${overdue.slice(0, 3).map((t) => `${t.title} (${t.dueDate})`).join(", ")}${overdue.length > 3 ? ", and more" : ""}.` : `• Nothing overdue${dueSoon.length ? `; ${dueSoon.length} due in the next 7 days` : ""}.`,
    estimate ? `• ${hrs(tracked)} tracked of ${estimate}h estimated (${Math.round((tracked / 60 / estimate) * 100)}%).` : `• ${hrs(tracked)} tracked so far; no estimate set.`,
    missed.length ? `• Missed milestone${missed.length > 1 ? "s" : ""}: ${missed.map((m) => `${m.name} (${m.date})`).join(", ")}.` : next ? `• Next milestone: ${next.name} on ${next.date}.` : null,
    blocked.length ? `• Risk: ${blocked.length} blocked ${blocked.length === 1 ? "task" : "tasks"}. Clear the blockers first.`
      : overdue.length ? "• Risk: overdue work. Re-plan dates or rebalance owners."
      : estimate && tracked / 60 > estimate * 0.9 && pct < 90 ? "• Risk: hours are close to the estimate with work still open. Review scope."
      : stats?.reasons.length ? `• Watch: ${stats.reasons[0]}` : "• No major risks right now.",
  ].filter(Boolean).join("\n");
  await audit(req, "ai_project_summary", "project", p.id, { new: { source: src(ai) } });
  res.json({ summary: ai ?? lines, source: src(ai), aiGenerated: true });
});

// ---------- Reports: summarize what's on screen ----------
const groupSchema = z.object({ name: z.string().max(200), minutes: z.number(), billableMinutes: z.number().optional() });
aiToolsRouter.post("/report-summary", async (req, res) => {
  guard(req);
  const d = z.object({
    from: z.string().max(10), to: z.string().max(10), groupBy: z.string().max(40).optional(),
    totals: z.object({ minutes: z.number(), billableMinutes: z.number(), nonBillableMinutes: z.number().optional(), entries: z.number() }),
    groups: z.array(groupSchema).max(30).default([]),
  }).parse(req.body);
  const groups = [...d.groups].sort((a, b) => b.minutes - a.minutes);
  const ai = await claude(
    "Summarize a time report in 2 to 4 plain sentences for a manager: total hours, billable share, where most time went, and anything that stands out. Show minutes as hours. No markdown. Use only the JSON facts.",
    JSON.stringify({ ...d, groups }),
  );
  const t = d.totals;
  const share = t.minutes ? Math.round((t.billableMinutes / t.minutes) * 100) : 0;
  const by = d.groupBy ? lower(d.groupBy) : "group";
  const top = groups.slice(0, 3);
  const fallback = t.minutes === 0 ? `No time was logged between ${d.from} and ${d.to} for these filters.` : [
    `${hrs(t.minutes)} logged across ${t.entries} ${t.entries === 1 ? "entry" : "entries"} from ${d.from} to ${d.to}, ${share}% of it billable.`,
    top.length ? `Most time went to ${top.map((g) => `${g.name} (${hrs(g.minutes)}, ${Math.round((g.minutes / t.minutes) * 100)}%)`).join(", ")}.` : null,
    groups.length > 1 && top[0].minutes / t.minutes > 0.6 ? `One ${by} accounts for most of the period.` : groups.length > 3 ? `${groups.length} ${by === "group" ? "groups" : `${by}s`} in total.` : null,
    share < 50 && t.minutes > 0 ? "Billable share is under half; check non-billable work." : null,
  ].filter(Boolean).join(" ");
  await audit(req, "ai_report_summary", "report", null, { new: { from: d.from, to: d.to, source: src(ai) } });
  res.json({ summary: ai ?? fallback, source: src(ai), aiGenerated: true });
});

// ---------- Home: what to focus on today ----------
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
aiToolsRouter.post("/focus", async (req, res) => {
  guard(req);
  const company = req.company!;
  const t0 = companyToday(req);
  const [tasks, todayMin, days] = await Promise.all([
    prisma.task.findMany({ where: { companyId: cid(req), assigneeId: uid(req), status: { not: "DONE" } }, select: { title: true, status: true, priority: true, dueDate: true, project: { select: { name: true } }, blockedBy: { select: { blocker: { select: { status: true } } } } }, take: 200 }),
    prisma.timeEntry.aggregate({ where: { companyId: cid(req), userId: uid(req), date: t0, running: false }, _sum: { minutes: true } }),
    prisma.timesheetDay.findMany({ where: { companyId: cid(req), userId: uid(req), status: { in: ["FAILED", "REJECTED", "REOPENED"] } }, select: { date: true, status: true, note: true }, take: 5 }),
  ]);
  const ready = tasks.filter((t) => !(t.status === "BLOCKED" || t.blockedBy.some((b) => b.blocker.status !== "DONE")));
  const score = (t: (typeof tasks)[number]) => (t.dueDate ? (t.dueDate < t0 ? 0 : t.dueDate === t0 ? 1 : t.dueDate <= addDays(t0, 3) ? 2 : 4) : 5) * 10 + (PRIORITY_RANK[t.priority] ?? 4) + (t.status === "IN_PROGRESS" ? -3 : t.status === "IN_REVIEW" ? -2 : 0);
  const ranked = [...ready].sort((a, b) => score(a) - score(b));
  const logged = todayMin._sum.minutes ?? 0;
  const target = Math.round(company.hoursPerDay * 60);
  const facts = {
    today: t0, loggedToday: hrs(logged), dailyTarget: hrs(target), openTasks: tasks.length, blocked: tasks.length - ready.length,
    candidates: ranked.slice(0, 8).map((t) => ({ title: t.title, project: t.project.name, status: t.status, priority: t.priority, due: t.dueDate })),
    timesheetDaysNeedingAttention: days,
  };
  const ai = await claude(
    "You help one person plan their work day in a time-tracking and task app. Give 3 to 5 short bullet lines starting with '• ': the tasks to focus on first and why (overdue, due soon, priority, already in progress), anything blocking, and a timesheet reminder if needed. Plain text. Use only the JSON facts.",
    JSON.stringify(facts),
  );
  const why = (t: (typeof tasks)[number]) => t.dueDate && t.dueDate < t0 ? `overdue since ${t.dueDate}` : t.dueDate === t0 ? "due today" : t.status === "IN_PROGRESS" ? "already in progress" : t.dueDate ? `due ${t.dueDate}` : `${lower(t.priority)} priority`;
  const lines = [
    ...(ranked.length ? ranked.slice(0, 3).map((t) => `• ${t.title} (${t.project.name}): ${why(t)}.`) : ["• No open tasks assigned to you. Pick something from your projects' backlog."]),
    tasks.length - ready.length ? `• ${tasks.length - ready.length} of your tasks ${tasks.length - ready.length === 1 ? "is" : "are"} blocked; nudge whoever they're waiting on.` : null,
    days.length ? `• Fix your timesheet for ${days.map((x) => x.date).join(", ")} before it holds up approvals.` : null,
    logged < target ? `• ${hrs(logged)} logged today of ${hrs(target)}. Log time as you go.` : `• You've logged ${hrs(logged)} today. Nice.`,
  ].filter(Boolean).join("\n");
  await audit(req, "ai_focus", "user", uid(req), { new: { source: src(ai) } });
  res.json({ summary: ai ?? lines, source: src(ai), aiGenerated: true });
});


// ---------- Timesheet: fill the gaps in a week ----------
// Looks at what the person worked on recently and what's in progress, and proposes entries for the open working days that are
// short of the daily target. Nothing is saved here; the person picks which suggestions to add.
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const round15 = (m: number) => Math.max(15, Math.round(m / 15) * 15);

function parseJsonArray<T>(text: string | null): T[] | null {
  if (!text) return null;
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { const v = JSON.parse(m[0]); return Array.isArray(v) ? (v as T[]) : null; } catch { return null; }
}

aiToolsRouter.post("/timesheet-fill", async (req, res) => {
  guard(req);
  const d = z.object({ from: DATE, to: DATE }).parse(req.body);
  const company = req.company!;
  const t0 = companyToday(req);
  const to = d.to < t0 ? d.to : t0;
  const work = new Set(company.workWeek.split(",").map(Number));
  const [holidays, leave, entries, recent, inProgress] = await Promise.all([
    prisma.holiday.findMany({ where: { companyId: cid(req), date: { gte: d.from, lte: to } }, select: { date: true } }),
    prisma.leaveRequest.findMany({ where: { companyId: cid(req), userId: uid(req), status: "APPROVED", from: { lte: to }, to: { gte: d.from } }, select: { from: true, to: true, halfDay: true } }),
    prisma.timeEntry.findMany({ where: { companyId: cid(req), userId: uid(req), date: { gte: d.from, lte: to } }, select: { date: true, minutes: true, projectId: true, taskId: true, running: true } }),
    prisma.timeEntry.findMany({
      where: { companyId: cid(req), userId: uid(req), running: false, date: { gte: addDays(d.from, -28), lte: to }, project: { archived: false } },
      select: { projectId: true, taskId: true, minutes: true, billable: true, description: true, date: true, project: { select: { name: true, color: true, parent: { select: { name: true, color: true } } } }, task: { select: { title: true, status: true } } },
      orderBy: { date: "desc" }, take: 400,
    }),
    prisma.task.findMany({
      where: { companyId: cid(req), assigneeId: uid(req), status: { in: ["IN_PROGRESS", "IN_REVIEW"] }, project: { archived: false } },
      select: { id: true, title: true, status: true, billable: true, projectId: true, project: { select: { name: true, color: true, parent: { select: { name: true, color: true } } } } }, take: 20,
    }),
  ]);
  // Only projects the person can still log time on (the same rule as saving an entry).
  const access = await accessibleProjectIds(cid(req), req.user!);
  const canLog = (id: number) => access === "all" || access.includes(id);
  const off = new Set(holidays.map((h) => h.date));
  for (const l of leave) for (let x = l.from; x <= l.to; x = addDays(x, 1)) if (!l.halfDay) off.add(x);

  // What to suggest: recent work weighted by time and recency, plus tasks in progress.
  type Cand = { key: string; projectId: number; taskId: number | null; project: string; color: string; task: string | null; billable: boolean; description: string; weight: number };
  const cands = new Map<string, Cand>();
  const nameOf = (p: { name: string; color: string; parent: { name: string; color: string } | null }) => ({ project: p.parent ? `${p.parent.name} › ${p.name}` : p.name, color: p.parent?.color ?? p.color });
  for (const e of recent) {
    if (e.task?.status === "DONE" || !canLog(e.projectId)) continue;
    const key = `${e.projectId}:${e.taskId ?? 0}`;
    const age = Math.max(0, (Date.parse(to) - Date.parse(e.date)) / 864e5);
    const c = cands.get(key) ?? { key, projectId: e.projectId, taskId: e.taskId, ...nameOf(e.project), task: e.task?.title ?? null, billable: e.billable, description: e.description, weight: 0 };
    c.weight += e.minutes * (age <= 7 ? 1.5 : 1);
    cands.set(key, c);
  }
  for (const t of inProgress) {
    if (!canLog(t.projectId)) continue;
    const key = `${t.projectId}:${t.id}`;
    const c = cands.get(key) ?? { key, projectId: t.projectId, taskId: t.id, ...nameOf(t.project), task: t.title, billable: t.billable, description: "", weight: 0 };
    c.weight += t.status === "IN_PROGRESS" ? 240 : 120;
    cands.set(key, c);
  }
  const ranked = [...cands.values()].sort((a, b) => b.weight - a.weight).slice(0, 4);

  const target = Math.round(company.hoursPerDay * 60);
  const suggestions: { date: string; projectId: number; taskId: number | null; project: string; color: string; task: string | null; minutes: number; billable: boolean; description: string }[] = [];
  const skipped: { date: string; reason: string }[] = [];
  let i = 0;
  for (let day = d.from; day <= to; day = addDays(day, 1)) {
    if (!work.has(weekday(day)) || off.has(day)) continue;
    const logged = entries.filter((e) => e.date === day).reduce((a, e) => a + e.minutes, 0);
    const gap = Math.round((target - logged) / 15) * 15;
    if (gap < 30) continue;
    try { await assertDayOpen(company, uid(req), day); } catch { skipped.push({ date: day, reason: "locked" }); continue; }
    if (!ranked.length) break;
    // Up to three items a day, rotating which comes first so the week doesn't look copy-pasted.
    const usedToday = new Set(entries.filter((e) => e.date === day).map((e) => `${e.projectId}:${e.taskId ?? 0}`));
    const pick = [...ranked.slice(i % ranked.length), ...ranked.slice(0, i % ranked.length)].filter((c) => !usedToday.has(c.key)).slice(0, gap >= 240 ? 3 : gap >= 120 ? 2 : 1);
    i++;
    if (!pick.length) continue;
    const w = pick.reduce((a, c) => a + c.weight, 0) || 1;
    let left = gap;
    pick.forEach((c, k) => {
      const m = k === pick.length - 1 ? left : Math.min(left, round15((gap * c.weight) / w));
      if (m < 15) return;
      left -= m;
      suggestions.push({ date: day, projectId: c.projectId, taskId: c.taskId, project: c.project, color: c.color, task: c.task, minutes: m, billable: c.billable, description: c.description || (c.task ? `Worked on ${c.task}` : `Worked on ${c.project}`) });
    });
  }

  // Claude rewrites the descriptions so each reads like a real entry; the plan itself stays the same.
  let source: Source = "template";
  if (suggestions.length) {
    const ai = parseJsonArray<string>(await claude(
      "You write one-line timesheet entry descriptions. For each item in the JSON array, write what the person most likely did, in past tense, under 100 characters, no trailing period. Base it on the task, project and their earlier description; vary wording across days. Reply with only a JSON array of strings, same length and order.",
      JSON.stringify(suggestions.map((x) => ({ date: x.date, project: x.project, task: x.task, earlierDescription: x.description, duration: hrs(x.minutes) }))),
    ));
    if (ai && ai.length === suggestions.length && ai.every((x) => typeof x === "string" && x.trim())) { ai.forEach((x, k) => (suggestions[k].description = x.trim().slice(0, 300))); source = "claude"; }
  }
  const total = suggestions.reduce((a, x) => a + x.minutes, 0);
  const days = new Set(suggestions.map((x) => x.date)).size;
  const summary = !ranked.length ? "There's no recent work or task in progress to base suggestions on. Log a few entries first, or start a task."
    : !suggestions.length ? (skipped.length ? "The days that are short are locked, so there's nothing to fill." : "Every working day up to today already meets the daily target. Nothing to fill.")
    : `${hrs(total)} across ${days} ${days === 1 ? "day" : "days"}, split between ${[...new Set(suggestions.map((x) => x.task ?? x.project))].slice(0, 3).join(", ")}. Untick anything you didn't do.`;
  await audit(req, "ai_timesheet_fill", "user", uid(req), { new: { from: d.from, to, suggestions: suggestions.length, source } });
  res.json({ suggestions, summary, source, target });
});

// ---------- Roadmap: plan dates for a project's open tasks ----------
// Schedules tasks with no due date, overdue ones and ones that start before their blocker is due: blockers first, then by priority,
// one task at a time per assignee, on working days, sized from the estimate. Nothing is saved here.
aiToolsRouter.post("/roadmap-plan", async (req, res) => {
  guard(req);
  if (!can(req, "roadmap", "edit")) throw new HttpError(403, "You can't change dates on the roadmap");
  const { projectId } = z.object({ projectId: z.number().int() }).parse(req.body);
  const p = await visibleProject(req, projectId);
  const company = req.company!;
  const t0 = companyToday(req);
  const scope = [p.id, ...p.children.map((c) => c.id)];
  const [tasks, holidays] = await Promise.all([
    prisma.task.findMany({
      where: { companyId: cid(req), projectId: { in: scope }, parentId: null, status: { not: "DONE" } },
      select: { id: true, number: true, title: true, status: true, priority: true, startDate: true, dueDate: true, estimateHours: true, assignee: { select: { id: true, name: true } }, blockedBy: { select: { blockerId: true, blocker: { select: { dueDate: true, status: true } } } } },
    }),
    prisma.holiday.findMany({ where: { companyId: cid(req), date: { gte: t0 } }, select: { date: true } }),
  ]);
  const work = new Set(company.workWeek.split(",").map(Number));
  const off = new Set(holidays.map((h) => h.date));
  const isWork = (x: string) => work.has(weekday(x)) && !off.has(x);
  const nextWork = (x: string) => { let y = x; for (let k = 0; k < 400 && !isWork(y); k++) y = addDays(y, 1); return y; };
  const afterWork = (x: string) => nextWork(addDays(x, 1));
  const addWork = (start: string, n: number) => { let y = start; for (let k = 1; k < n; k++) y = afterWork(y); return y; };

  const conflict = (t: (typeof tasks)[number]) => t.blockedBy.some((b) => b.blocker.status !== "DONE" && b.blocker.dueDate && (t.startDate ?? t.dueDate) && b.blocker.dueDate >= (t.startDate ?? t.dueDate)!);
  const plan = new Map(tasks.filter((t) => !t.dueDate || t.dueDate < t0 || conflict(t)).map((t) => [t.id, t]));
  const due = new Map<number, string | null>(tasks.map((t) => [t.id, t.dueDate]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const base = nextWork(p.startDate && p.startDate > t0 ? p.startDate : t0);

  // Blockers first (depth-first), then priority, keeping work already in progress at the front.
  const order: number[] = [];
  const seen = new Set<number>();
  const rank = (t: (typeof tasks)[number]) => (t.status === "IN_PROGRESS" || t.status === "IN_REVIEW" ? -1 : 0) * 10 + (PRIORITY_RANK[t.priority] ?? 4);
  const visit = (id: number) => {
    if (seen.has(id) || !plan.has(id)) return;
    seen.add(id);
    for (const b of plan.get(id)!.blockedBy) visit(b.blockerId);
    order.push(id);
  };
  [...plan.values()].sort((a, b) => rank(a) - rank(b) || a.number - b.number).forEach((t) => visit(t.id));

  const free = new Map<number, string>();
  const key = companySettings(company).taskKey;
  const proposals: { id: number; key: string; title: string; assignee: string | null; days: number; from: { startDate: string | null; dueDate: string | null }; startDate: string; dueDate: string; reason: string }[] = [];
  for (const id of order) {
    const t = plan.get(id)!;
    const days = Math.min(15, Math.max(1, Math.ceil((t.estimateHours ?? (t.priority === "URGENT" || t.priority === "HIGH" ? 8 : 12)) / company.hoursPerDay)));
    let start = base;
    let why = t.estimateHours ? `${days} working ${days === 1 ? "day" : "days"} from its ${t.estimateHours}h estimate` : `${days} working ${days === 1 ? "day" : "days"} (no estimate)`;
    const lane = t.assignee ? free.get(t.assignee.id) : undefined;
    if (lane && lane > start) { start = lane; why += `, after ${t.assignee!.name.split(" ")[0]}'s earlier task`; }
    for (const b of t.blockedBy) {
      const bd = due.get(b.blockerId);
      if (b.blocker.status !== "DONE" && bd && afterWork(bd) > start) { start = afterWork(bd); why = `${why}, after ${key}-${byId.get(b.blockerId)?.number ?? b.blockerId}`; }
    }
    start = nextWork(start);
    const end = addWork(start, days);
    due.set(id, end);
    if (t.assignee) free.set(t.assignee.id, afterWork(end));
    proposals.push({ id, key: `${key}-${t.number}`, title: t.title, assignee: t.assignee?.name ?? null, days, from: { startDate: t.startDate, dueDate: t.dueDate }, startDate: start, dueDate: end, reason: (t.dueDate && t.dueDate < t0 ? "Was overdue. " : conflict(t) ? "Started before its blocker was due. " : "") + why.charAt(0).toUpperCase() + why.slice(1) + "." });
  }
  const last = proposals.map((x) => x.dueDate).sort().at(-1) ?? null;
  const late = !!(last && p.endDate && last > p.endDate);
  const facts = { project: p.name, targetDate: p.endDate, today: t0, planned: proposals.map(({ key: k, title, assignee, startDate, dueDate, reason }) => ({ key: k, title, assignee, startDate, dueDate, reason })), finishes: last, unassigned: proposals.filter((x) => !x.assignee).length };
  const ai = proposals.length ? await claude(
    "You review a proposed schedule for a project's open tasks. In 2 to 4 short plain sentences: when the work would finish against the target date, the critical path or busiest person, and one concrete suggestion (for example who to rebalance or what to cut). Use only the JSON facts. No markdown.",
    JSON.stringify(facts),
  ) : null;
  const busiest = [...proposals.reduce((m, x) => (x.assignee ? m.set(x.assignee, (m.get(x.assignee) ?? 0) + x.days) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];
  const fallback = !proposals.length ? "Every open task already has dates that fit its blockers. Nothing to plan."
    : [
      `${proposals.length} ${proposals.length === 1 ? "task" : "tasks"} scheduled from ${proposals.map((x) => x.startDate).sort()[0]} to ${last}.`,
      p.endDate ? (late ? `That's after the target date (${p.endDate}); consider moving it or cutting scope.` : `That fits before the target date (${p.endDate}).`) : null,
      busiest && busiest[1] > 5 ? `${busiest[0]} carries the most (${busiest[1]} working days); spread some of it if you can.` : null,
      facts.unassigned ? `${facts.unassigned} ${facts.unassigned === 1 ? "task has" : "tasks have"} no assignee yet.` : null,
    ].filter(Boolean).join(" ");
  await audit(req, "ai_roadmap_plan", "project", p.id, { new: { proposals: proposals.length, source: src(ai) } });
  res.json({ project: { id: p.id, name: p.name, endDate: p.endDate }, proposals, summary: ai ?? fallback, source: src(ai), late });
});

// ---------- Task: break it into subtasks ----------
aiToolsRouter.post("/subtasks-draft", async (req, res) => {
  guard(req);
  const { taskId } = z.object({ taskId: z.number().int() }).parse(req.body);
  const t = await prisma.task.findFirst({ where: { id: taskId, companyId: cid(req) }, select: { title: true, description: true, projectId: true, subtasks: { select: { title: true } } } });
  if (!t) throw new HttpError(404, "Task not found");
  const project = await visibleProject(req, t.projectId);
  const ai = parseJsonArray<string>(await claude(
    "Break a task into 3 to 6 concrete subtasks someone can finish in a day or less. Short imperative titles under 70 characters. Skip anything already in existingSubtasks. Reply with only a JSON array of strings.",
    JSON.stringify({ title: t.title, description: t.description?.slice(0, 1500) ?? null, project: project.name, existingSubtasks: t.subtasks.map((x) => x.title) }),
  ));
  // Without Claude: the checklist in the description, else the steps for this kind of task.
  const desc = t.description ?? "";
  const checklist = desc.match(/(?:^|\n)\s*(?:checklist|steps|to ?do)\s*:?\s*\n([\s\S]*)/i)?.[1] ?? desc.split("\n").filter((l) => /^\s*[-*]\s*\[[ xX]?\]/.test(l)).join("\n");
  const fromChecklist = checklist.split("\n").map((l) => l.match(/^\s*(?:[-*•]|\d+[.)])\s+(?:\[[ xX]?\]\s*)?(.+)/)?.[1]?.trim()).filter((x): x is string => !!x);
  const name = t.title.replace(/[.\s]+$/, "");
  const steps = fromChecklist.length >= 2 ? fromChecklist : TASK_KINDS.find(([re]) => re.test(t.title))?.[1]
    ?? [`Agree the scope of ${name}`, `Gather what's needed for ${name}`, `First draft of ${name}`, `Review ${name} with the team`, `Finalize and share ${name}`];
  const have = new Set(t.subtasks.map((x) => x.title.toLowerCase()));
  const list = (ai?.filter((x) => typeof x === "string" && x.trim()) ?? steps).map((x) => x.trim().slice(0, 200)).filter((x) => !have.has(x.toLowerCase())).slice(0, 8);
  await audit(req, "ai_subtasks_drafted", "task", taskId, { new: { count: list.length, source: ai ? "claude" : "template" } });
  res.json({ subtasks: list, source: ai ? "claude" : "template" });
});

// ---------- Ask AI chat (top bar) ----------
// A conversation about the person's own work: time, tasks, timesheet, projects they can see, leave and what waits on their approval.
// Claude answers from these facts when a key is set; otherwise a built-in reader handles the common questions.
const msgSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) });
aiToolsRouter.post("/chat", async (req, res) => {
  guard(req);
  const { messages } = z.object({ messages: z.array(msgSchema).min(1).max(30) }).parse(req.body);
  const q = messages.at(-1)!.content;
  if (messages.at(-1)!.role !== "user") throw new HttpError(400, "The last message must be a question");
  const company = req.company!;
  const t0 = companyToday(req);
  const text = q.toLowerCase();
  const periodName = PERIODS.find(([re]) => re.test(text))?.[1] ?? "this week";
  const range = periodRange(periodName, t0, company.weekStartsOn);
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const projects = await prisma.project.findMany({ where: { companyId: cid(req), archived: false, ...(ids === "all" ? {} : { id: { in: ids } }) }, select: { id: true, name: true, parentId: true, status: true, endDate: true } });
  const named = projects.filter((p) => text.includes(p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  const namedIds = named ? projects.filter((p) => p.id === named.id || p.parentId === named.id).map((p) => p.id) : undefined;
  const top = projects.filter((p) => !p.parentId);
  const canLeave = can(req, "leaveApprove", "yes"), canSheets = can(req, "approveTimesheets", "yes"), canExp = can(req, "expenseApprove", "yes");
  const [entries, tasks, days, stats, myLeave, pendingLeave, pendingExp, pendingDays] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { companyId: cid(req), userId: uid(req), running: false, date: { gte: range.from, lte: range.to }, ...(namedIds ? { projectId: { in: namedIds } } : {}) },
      select: { minutes: true, billable: true, date: true, project: { select: { name: true, parent: { select: { name: true } } } }, task: { select: { title: true } } },
    }),
    prisma.task.findMany({ where: { companyId: cid(req), assigneeId: uid(req), status: { not: "DONE" }, ...(namedIds ? { projectId: { in: namedIds } } : {}) }, select: { title: true, status: true, priority: true, dueDate: true, project: { select: { name: true } }, blockedBy: { select: { blocker: { select: { status: true } } } } }, take: 200 }),
    prisma.timesheetDay.findMany({ where: { companyId: cid(req), userId: uid(req), status: { in: ["FAILED", "REJECTED", "REOPENED"] } }, select: { date: true, status: true, note: true }, take: 10 }),
    projectStats(cid(req), (named ? [named.parentId ?? named.id] : top.map((p) => p.id)).slice(0, 60)),
    prisma.leaveRequest.findMany({ where: { companyId: cid(req), userId: uid(req), to: { gte: addDays(t0, -30) }, status: { in: ["PENDING", "APPROVED"] } }, select: { type: true, from: true, to: true, status: true, halfDay: true }, orderBy: { from: "asc" }, take: 10 }),
    canLeave ? prisma.leaveRequest.count({ where: { companyId: cid(req), status: "PENDING", userId: { not: uid(req) } } }) : Promise.resolve(null),
    canExp ? prisma.reimbursement.count({ where: { companyId: cid(req), status: "PENDING", userId: { not: uid(req) } } }) : Promise.resolve(null),
    canSheets ? prisma.timesheetDay.count({ where: { companyId: cid(req), status: "SUBMITTED", userId: { not: uid(req) } } }) : Promise.resolve(null),
  ]);
  const total = entries.reduce((a, e) => a + e.minutes, 0);
  const billable = entries.reduce((a, e) => a + (e.billable ? e.minutes : 0), 0);
  const byProject = new Map<string, number>();
  for (const e of entries) { const n = e.project.parent?.name ?? e.project.name; byProject.set(n, (byProject.get(n) ?? 0) + e.minutes); }
  const topProjects = [...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const blockedT = tasks.filter((t) => t.status === "BLOCKED" || t.blockedBy.some((b) => b.blocker.status !== "DONE"));
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < t0).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
  const dueSoon = tasks.filter((t) => t.dueDate && t.dueDate >= t0 && t.dueDate <= addDays(t0, 7)).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
  const health = [...stats.entries()].map(([id, s]) => ({ name: top.find((p) => p.id === id)?.name ?? projects.find((p) => p.id === id)?.name ?? String(id), health: s.health, progress: s.progress, reasons: s.reasons.slice(0, 2) }));
  const atRisk = health.filter((h) => h.health !== "ON_TRACK");
  const facts = {
    today: t0, you: req.user!.name, period: periodName, range, project: named?.name ?? null,
    time: { loggedMinutes: total, billableMinutes: billable, entries: entries.length, byProject: topProjects.map(([name, minutes]) => ({ name, minutes })), dailyTargetMinutes: Math.round(company.hoursPerDay * 60) },
    tasks: { open: tasks.length, inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length, blocked: blockedT.length, overdue: overdue.slice(0, 8).map((t) => ({ title: t.title, project: t.project.name, due: t.dueDate })), dueThisWeek: dueSoon.slice(0, 8).map((t) => ({ title: t.title, project: t.project.name, due: t.dueDate, priority: t.priority })) },
    timesheetDaysNeedingAttention: days, projects: health.slice(0, 25).map((h) => ({ ...h, progress: `${Math.round(h.progress * 100)}%` })), myLeave,
    waitingOnYourApproval: { leave: pendingLeave, reimbursements: pendingExp, timesheetDays: pendingDays },
  };
  const links: { label: string; to: string }[] = [];
  const ai = await claudeChat(
    `You are the Ask AI assistant inside Orbit0, a time tracking and work management app. You talk with ${req.user!.name} about their own work. Answer only from the JSON facts in the latest message (they are fresh for each question); if the facts don't cover something, say so briefly and suggest where in the app to look. Show minutes as hours and minutes. Be brief: 1 to 5 short sentences, or a few lines starting with '• ' for lists. Plain text, no markdown headings or bold.`,
    [...messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: `${q}\n\nFacts: ${JSON.stringify(facts)}` }],
  );

  let answer: string;
  const timeLink = { label: "Open Time tracker", to: `/time?from=${range.from}&to=${range.to}` };
  if (/\b(focus|priorit|what should|start with|plan my|next)\b/.test(text)) {
    const list = [...overdue, ...dueSoon.filter((t) => !overdue.includes(t))].filter((t) => !blockedT.includes(t)).slice(0, 4);
    answer = list.length ? ["Here's where I'd start:", ...list.map((t) => `• ${t.title} (${t.project.name}): ${t.dueDate! < t0 ? `overdue since ${t.dueDate}` : t.dueDate === t0 ? "due today" : `due ${t.dueDate}`}`), blockedT.length ? `• ${blockedT.length} of your tasks are blocked; nudge whoever they wait on.` : null].filter(Boolean).join("\n")
      : tasks.length ? `Nothing is overdue or due this week. You have ${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"}; pick up whatever's in progress first.` : "You have no open tasks assigned. Check your projects' backlog.";
    links.push({ label: "Open My tasks", to: "/my-tasks" });
  } else if (/\b(overdue|due|deadline|tasks?|blocked)\b/.test(text)) {
    answer = [
      overdue.length ? `${overdue.length} overdue: ${overdue.slice(0, 4).map((t) => `${t.title} (${t.dueDate})`).join(", ")}${overdue.length > 4 ? ", and more" : ""}.` : "Nothing overdue.",
      dueSoon.length ? `${dueSoon.length} due in the next 7 days: ${dueSoon.slice(0, 4).map((t) => `${t.title} (${t.dueDate})`).join(", ")}${dueSoon.length > 4 ? ", and more" : ""}.` : "Nothing else due in the next 7 days.",
      blockedT.length ? `${blockedT.length} ${blockedT.length === 1 ? "is" : "are"} blocked.` : null,
    ].filter(Boolean).join(" ");
    links.push({ label: "Open My tasks", to: "/my-tasks" });
  } else if (/\b(submit|timesheet|fix|returned|rejected|failed|missing)\b/.test(text)) {
    answer = days.length ? `${days.length} ${days.length === 1 ? "day needs" : "days need"} attention: ${days.map((x) => `${x.date} (${x.status === "FAILED" ? "couldn't be submitted" : x.status === "REJECTED" ? "sent back" : "reopened"}${x.note ? `: ${x.note}` : ""})`).join("; ")}.` : "All your days are submitted or still open. Nothing needs fixing.";
    links.push({ label: "Open Timesheet", to: "/timesheet" });
  } else if (/\b(projects?|health|risk|delayed|on track|status|progress)\b/.test(text)) {
    answer = named && health[0] ? `${health[0].name} is ${lower(health[0].health)} at ${Math.round(health[0].progress * 100)}% done${health[0].reasons.length ? `: ${health[0].reasons.join("; ")}` : ""}.`
      : atRisk.length ? `${atRisk.length} of ${health.length} projects need attention:\n${atRisk.slice(0, 6).map((h) => `• ${h.name}: ${lower(h.health)}${h.reasons[0] ? `, ${h.reasons[0]}` : ""}`).join("\n")}` : `All ${health.length} projects you can see are on track.`;
    links.push({ label: "Open Projects", to: "/projects" });
  } else if (/\b(leave|vacation|holiday|day off|time off|sick)\b/.test(text)) {
    answer = myLeave.length ? `Your leave: ${myLeave.map((l) => `${lower(l.type)} ${l.from}${l.to !== l.from ? ` to ${l.to}` : ""} (${lower(l.status)})`).join("; ")}.` : "You have no upcoming or pending leave.";
    if (pendingLeave) answer += ` ${pendingLeave} leave ${pendingLeave === 1 ? "request is" : "requests are"} waiting on your approval.`;
    links.push({ label: "Open Leave", to: "/leave" });
  } else if (/\b(approv|pending|waiting|review)\w*/.test(text)) {
    const parts = [pendingDays ? `${pendingDays} timesheet ${pendingDays === 1 ? "day" : "days"}` : null, pendingLeave ? `${pendingLeave} leave ${pendingLeave === 1 ? "request" : "requests"}` : null, pendingExp ? `${pendingExp} ${pendingExp === 1 ? "reimbursement" : "reimbursements"}` : null].filter(Boolean);
    answer = canLeave || canSheets || canExp ? (parts.length ? `Waiting on you: ${parts.join(", ")}.` : "Nothing is waiting on your approval.") : "You don't approve anything in this company, so nothing waits on you.";
    links.push({ label: "Open Approvals", to: "/approvals" });
  } else {
    answer = `You logged ${hrs(total)}${named ? ` on ${named.name}` : ""} ${periodName === "today" || periodName === "yesterday" ? periodName : `${periodName} (${range.from} to ${range.to})`}` +
      (total && !named && topProjects.length ? `, most of it on ${topProjects.slice(0, 3).map(([n, m]) => `${n} (${hrs(m)})`).join(", ")}.` : ".") +
      (total ? ` ${Math.round((billable / total) * 100)}% was billable.` : "");
    links.push(timeLink);
  }
  if (!links.length) links.push(timeLink);
  res.json({ answer: ai ?? answer, source: ai ? "claude" : "built-in", links });
});
