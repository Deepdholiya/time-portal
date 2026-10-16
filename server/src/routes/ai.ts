// AI helpers across the portal: drafting task and time descriptions, tidying expense claims, and short summaries of a project,
// a report or the person's day. Each one uses Claude when ANTHROPIC_API_KEY is set and falls back to a deterministic writer
// built from the same facts, so the button always returns something useful.
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { projectStats } from "../health.js";
import { addDays, zonedNow } from "../weeks.js";
import { aiAllowed, claude } from "./misc.js";
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
