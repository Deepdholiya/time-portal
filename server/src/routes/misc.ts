// Notifications, AI assistance, client email and the public client status page.
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma, audit, companySettings } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { accessibleProjectIds } from "../permissions.js";
import { projectStats } from "../health.js";
import { appUrl, sendMail } from "../mail.js";
import { addDays, today, weekStartOf, zonedNow } from "../weeks.js";

export const notificationsRouter = Router();
export const aiRouter = Router();
export const publicRouter = Router();

// ---------- Notifications ----------
notificationsRouter.get("/", async (req, res) => {
  const q = z.object({ unread: z.enum(["true", "false"]).optional(), limit: z.coerce.number().int().max(200).default(60) }).parse(req.query);
  const where = { userId: uid(req), OR: [{ companyId: cid(req) }, { companyId: null }], ...(q.unread === "true" ? { readAt: null } : {}) };
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: q.limit }),
    prisma.notification.count({ where: { userId: uid(req), OR: [{ companyId: cid(req) }, { companyId: null }], readAt: null } }),
  ]);
  res.json({ unread, rows });
});
notificationsRouter.get("/count", async (req, res) => {
  res.json({ unread: await prisma.notification.count({ where: { userId: uid(req), OR: [{ companyId: cid(req) }, { companyId: null }], readAt: null } }) });
});
notificationsRouter.post("/:id/read", async (req, res) => {
  const { read } = z.object({ read: z.boolean().default(true) }).parse(req.body ?? {});
  await prisma.notification.updateMany({ where: { id: Number(req.params.id), userId: uid(req) }, data: { readAt: read ? new Date() : null } });
  res.json({ ok: true });
});
notificationsRouter.post("/read-all", async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: uid(req), readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});
notificationsRouter.delete("/:id", async (req, res) => {
  await prisma.notification.deleteMany({ where: { id: Number(req.params.id), userId: uid(req) } });
  res.json({ ok: true });
});

// ---------- AI ----------
// Uses the Claude API when ANTHROPIC_API_KEY is set; otherwise a deterministic writer drafts from the same data.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

async function claude(system: string, prompt: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { console.error("Claude API error", r.status, await r.text()); return null; }
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    return j.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim() || null;
  } catch (e) {
    console.error("Claude API request failed", e);
    return null;
  }
}

function aiAllowed(req: Request) {
  if (!companySettings(req.company!).aiEnabled) throw new HttpError(403, "AI is turned off for this company");
}

// Only client-facing facts: no hours, rates, budgets or employee names.
async function clientFacts(req: Request, projectId: number) {
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const p = await prisma.project.findFirst({ where: { id: projectId, companyId: cid(req), parentId: null }, include: { client: true, milestones: { orderBy: { date: "asc" } }, children: { select: { id: true, name: true } } } });
  if (!p || (ids !== "all" && !ids.includes(p.id))) throw new HttpError(404, "Project not found");
  const since = addDays(today(), -14);
  const done = await prisma.task.findMany({ where: { companyId: cid(req), OR: [{ projectId: p.id }, { project: { parentId: p.id } }], status: "DONE", completedAt: { gte: new Date(since) } }, select: { title: true }, orderBy: { completedAt: "desc" }, take: 12 });
  const next = await prisma.task.findMany({ where: { companyId: cid(req), OR: [{ projectId: p.id }, { project: { parentId: p.id } }], status: { not: "DONE" }, dueDate: { gte: today(), lte: addDays(today(), 21) } }, select: { title: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 8 });
  const stats = (await projectStats(cid(req), [p.id])).get(p.id)!;
  return {
    project: p,
    facts: {
      project: p.name, client: p.client?.name ?? null, contact: p.client?.contactName ?? null, status: p.status, progressPct: Math.round(stats.progress * 100),
      milestonesDone: p.milestones.filter((m) => m.done).map((m) => ({ name: m.name, date: m.date })),
      milestonesUpcoming: p.milestones.filter((m) => !m.done).map((m) => ({ name: m.name, date: m.date })),
      recentlyCompleted: done.map((t) => t.title), comingUp: next.map((t) => ({ title: t.title, due: t.dueDate })),
      workstreams: p.children.map((c) => c.name),
    },
  };
}

function templateEmail(f: Awaited<ReturnType<typeof clientFacts>>["facts"], kind: string, sender: string) {
  const greet = f.contact ? `Hi ${f.contact.split(" ")[0]},` : "Hello,";
  const lines = [greet, "", kind === "completion" ? `I'm happy to share that ${f.project} is complete.` : `Here's where ${f.project} stands this week. We're about ${f.progressPct}% of the way through the planned work.`, ""];
  if (f.recentlyCompleted.length) lines.push("Recently completed:", ...f.recentlyCompleted.slice(0, 6).map((t) => `• ${t}`), "");
  if (f.milestonesDone.length) lines.push("Milestones reached:", ...f.milestonesDone.slice(-4).map((m) => `• ${m.name} (${m.date})`), "");
  if (kind !== "completion" && f.milestonesUpcoming.length) lines.push("Next milestones:", ...f.milestonesUpcoming.slice(0, 3).map((m) => `• ${m.name}, planned for ${m.date}`), "");
  if (kind !== "completion" && f.comingUp.length) lines.push("Coming up:", ...f.comingUp.slice(0, 5).map((t) => `• ${t.title}${t.due ? ` (by ${t.due})` : ""}`), "");
  lines.push("You can follow progress any time on the status page linked below.", "", "Best regards,", sender);
  return lines.join("\n");
}

aiRouter.post("/client-email/draft", async (req, res) => {
  if (!can(req, "clientEmail", "yes")) throw new HttpError(403, "You can't send client emails");
  aiAllowed(req);
  const d = z.object({ projectId: z.number().int(), kind: z.enum(["update", "completion"]).default("update"), tone: z.enum(["friendly", "formal", "brief"]).default("friendly") }).parse(req.body);
  const { project, facts } = await clientFacts(req, d.projectId);
  const system = "You write short, clear client emails for a delivery team. Use only the facts given. Never mention internal hours, rates, budgets, costs or individual employees. Plain text, no markdown headings. Sign off with the sender's name.";
  const prompt = `Write a ${d.tone} ${d.kind === "completion" ? "project completion" : "progress update"} email to the client.\nSender: ${req.user!.name}\nFacts (JSON): ${JSON.stringify(facts)}\nReturn only the email body.`;
  const ai = await claude(system, prompt);
  const token = project.clientShareToken;
  await audit(req, "client_email_drafted", "project", project.id, { new: { kind: d.kind, source: ai ? "claude" : "template" } });
  res.json({
    to: project.client?.email ?? "", subject: d.kind === "completion" ? `${project.name} is complete` : `${project.name}: progress update`,
    body: ai ?? templateEmail(facts, d.kind, req.user!.name),
    link: token ? `${appUrl()}/client/${token}` : null, source: ai ? "claude" : "template", aiGenerated: true,
  });
});

aiRouter.post("/client-email/send", async (req, res) => {
  if (!can(req, "clientEmail", "yes")) throw new HttpError(403, "You can't send client emails");
  const d = z.object({
    projectId: z.number().int(), to: z.string().email("Enter the client's email"), subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20000), includeLink: z.boolean().default(true), aiGenerated: z.boolean().default(false), confirm: z.literal(true, { message: "Confirm before sending" }),
  }).parse(req.body);
  const { project } = await clientFacts(req, d.projectId);
  let token = project.clientShareToken;
  if (d.includeLink && !token) {
    token = (await import("../auth.js")).randomToken(18);
    await prisma.project.update({ where: { id: project.id }, data: { clientShareToken: token } });
  }
  const body = d.includeLink ? `${d.body}\n\nProject status: ${appUrl()}/client/${token}` : d.body;
  const msg = await sendMail({ companyId: cid(req), kind: "CLIENT_UPDATE", to: d.to, subject: d.subject, body, aiGenerated: d.aiGenerated, sentById: uid(req) });
  await audit(req, "client_email_sent", "project", project.id, { new: { to: d.to, subject: d.subject, aiGenerated: d.aiGenerated, emailId: msg.id } });
  res.json({ ok: true, id: msg.id });
});

aiRouter.post("/task-summary", async (req, res) => {
  if (!can(req, "aiAssist", "yes")) throw new HttpError(403, "AI isn't available for your account");
  aiAllowed(req);
  const { taskId } = z.object({ taskId: z.number().int() }).parse(req.body);
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const t = await prisma.task.findFirst({
    where: { id: taskId, companyId: cid(req), ...(ids === "all" ? {} : { OR: [{ projectId: { in: ids } }, { assigneeId: uid(req) }] }) },
    include: { comments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 40 }, subtasks: { select: { title: true, status: true } }, project: { select: { name: true } }, blockedBy: { include: { blocker: { select: { title: true, status: true } } } } },
  });
  if (!t) throw new HttpError(404, "Task not found");
  const facts = { title: t.title, project: t.project.name, status: t.status, priority: t.priority, due: t.dueDate, description: t.description?.slice(0, 4000), subtasks: t.subtasks, blockedBy: t.blockedBy.map((b) => b.blocker), comments: t.comments.map((c) => ({ by: c.user.name, at: c.createdAt.toISOString().slice(0, 10), text: c.body.slice(0, 600) })) };
  const ai = await claude("Summarize a work task for a teammate in 3 to 6 short bullet points: current state, decisions from comments, blockers, and the next step. Use only the given data.", JSON.stringify(facts));
  const done = t.subtasks.filter((s) => s.status === "DONE").length;
  const fallback = [
    `• ${t.title} is ${t.status.replace("_", " ").toLowerCase()}${t.dueDate ? `, due ${t.dueDate}` : ""} (${t.priority.toLowerCase()} priority).`,
    t.subtasks.length ? `• ${done} of ${t.subtasks.length} subtasks done.` : null,
    t.blockedBy.length ? `• Waiting on: ${t.blockedBy.filter((b) => b.blocker.status !== "DONE").map((b) => b.blocker.title).join(", ") || "nothing (all blockers done)"}.` : null,
    t.comments.length ? `• Latest comment from ${t.comments.at(-1)!.user.name}: "${t.comments.at(-1)!.body.slice(0, 160)}"` : "• No comments yet.",
  ].filter(Boolean).join("\n");
  res.json({ summary: ai ?? fallback, source: ai ? "claude" : "template", aiGenerated: true });
});

// ---------- Ask AI from the search bar ----------
// Answers questions about the person's own time and tasks. Claude writes the answer when a key is set; otherwise a built-in
// reader handles the common questions (hours in a period, hours on a project, what's due) from the same facts.
const PERIODS: [RegExp, string][] = [[/\btoday\b/, "today"], [/\byesterday\b/, "yesterday"], [/\blast week\b/, "last week"], [/\bthis month\b/, "this month"], [/\blast month\b/, "last month"], [/\bthis week\b|\bweek\b/, "this week"]];

function periodRange(name: string, t: string, startsOn: number) {
  const ws = weekStartOf(t, startsOn);
  const ms = t.slice(0, 8) + "01";
  switch (name) {
    case "today": return { from: t, to: t };
    case "yesterday": return { from: addDays(t, -1), to: addDays(t, -1) };
    case "last week": return { from: addDays(ws, -7), to: addDays(ws, -1) };
    case "this month": return { from: ms, to: t };
    case "last month": { const end = addDays(ms, -1); return { from: end.slice(0, 8) + "01", to: end }; }
    default: return { from: ws, to: t };
  }
}
const hrs = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };

aiRouter.post("/ask", async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(2, "Ask a question").max(500) }).parse(req.body);
  const company = req.company!;
  const t = zonedNow(company.timezone).date;
  const text = q.toLowerCase();
  const periodName = PERIODS.find(([re]) => re.test(text))?.[1] ?? "this week";
  const range = periodRange(periodName, t, company.weekStartsOn);
  const ids = await accessibleProjectIds(cid(req), req.user!, req.perms);
  const projects = await prisma.project.findMany({ where: { companyId: cid(req), archived: false, ...(ids === "all" ? {} : { id: { in: ids } }) }, select: { id: true, name: true, parentId: true } });
  const project = projects.filter((p) => text.includes(p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  const projectIds = project ? projects.filter((p) => p.id === project.id || p.parentId === project.id).map((p) => p.id) : undefined;
  const entries = await prisma.timeEntry.findMany({
    where: { companyId: cid(req), userId: uid(req), running: false, date: { gte: range.from, lte: range.to }, ...(projectIds ? { projectId: { in: projectIds } } : {}) },
    select: { minutes: true, billable: true, date: true, description: true, project: { select: { name: true, parent: { select: { name: true } } } } },
  });
  const total = entries.reduce((a, e) => a + e.minutes, 0);
  const byProject = new Map<string, number>();
  for (const e of entries) { const n = e.project.parent?.name ?? e.project.name; byProject.set(n, (byProject.get(n) ?? 0) + e.minutes); }
  const top = [...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const tasks = await prisma.task.findMany({ where: { companyId: cid(req), assigneeId: uid(req), status: { not: "DONE" }, dueDate: { not: null, lte: addDays(t, 7) } }, select: { id: true, number: true, title: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 8 });
  const days = await prisma.timesheetDay.findMany({ where: { companyId: cid(req), userId: uid(req), status: { in: ["FAILED", "REJECTED", "REOPENED"] } }, select: { date: true, status: true, note: true }, take: 10 });
  const facts = {
    today: t, period: periodName, range, project: project?.name ?? null, loggedMinutes: total, billableMinutes: entries.reduce((a, e) => a + (e.billable ? e.minutes : 0), 0),
    byProject: top.map(([name, minutes]) => ({ name, minutes })), entries: entries.length,
    tasksDueWithinAWeek: tasks.map((x) => ({ title: x.title, due: x.dueDate })), daysNeedingAttention: days,
  };
  const timeLink = { label: `Open ${periodName} in Time tracker`, to: `/time?from=${range.from}&to=${range.to}` };
  const aiOn = companySettings(company).aiEnabled && can(req, "aiAssist", "yes");
  const ai = aiOn ? await claude("You answer a person's questions about their own logged time and tasks in a time-tracking app. Use only the JSON facts given. Minutes must be shown as hours and minutes. Two to four short sentences, plain text, no markdown.", `Question: ${q}\nFacts: ${JSON.stringify(facts)}`) : null;
  if (ai) return res.json({ answer: ai, source: "claude", links: [timeLink] });

  let answer: string;
  const links = [timeLink];
  if (/\b(due|overdue|deadline|task)/.test(text)) {
    answer = tasks.length ? `You have ${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"} due by ${addDays(t, 7)}: ${tasks.slice(0, 4).map((x) => `${x.title} (${x.dueDate})`).join(", ")}${tasks.length > 4 ? ", and more" : ""}.` : "Nothing assigned to you is due in the next week.";
    links.unshift({ label: "Open My tasks", to: "/my-tasks" });
  } else if (/\b(submit|submission|fix|returned|rejected|failed)/.test(text)) {
    answer = days.length ? `${days.length} ${days.length === 1 ? "day needs" : "days need"} attention: ${days.map((d) => `${d.date} (${d.status === "FAILED" ? "couldn't be submitted" : d.status === "REJECTED" ? "sent back" : "reopened"}${d.note ? `: ${d.note}` : ""})`).join("; ")}.` : "All your days are submitted or still open for today. Nothing needs fixing.";
    links.unshift({ label: "Open Timesheet", to: "/timesheet" });
  } else {
    answer = `You logged ${hrs(total)}${project ? ` on ${project.name}` : ""} ${periodName === "today" || periodName === "yesterday" ? periodName : `${periodName} (${range.from} to ${range.to})`}` +
      (total && !project && top.length ? `, most of it on ${top.slice(0, 3).map(([n, m]) => `${n} (${hrs(m)})`).join(", ")}.` : ".") +
      (total ? ` ${Math.round((facts.billableMinutes / total) * 100)}% was billable.` : "");
  }
  res.json({ answer, source: "built-in", links });
});

// ---------- Public client status page (no sign-in; client-safe fields only) ----------
publicRouter.get("/client/:token", async (req, res) => {
  const p = await prisma.project.findUnique({ where: { clientShareToken: req.params.token }, include: { company: { select: { name: true, color: true } }, client: { select: { name: true } }, milestones: { orderBy: { date: "asc" } } } });
  if (!p || p.archived) throw new HttpError(404, "This link is no longer active");
  const stats = (await projectStats(p.companyId, [p.id])).get(p.id)!;
  const done = await prisma.task.findMany({ where: { OR: [{ projectId: p.id }, { project: { parentId: p.id } }], status: "DONE" }, select: { title: true, completedAt: true }, orderBy: { completedAt: "desc" }, take: 10 });
  res.json({
    company: p.company, project: { name: p.name, description: p.description, status: p.status, startDate: p.startDate, endDate: p.endDate, client: p.client?.name ?? null },
    progress: stats.progress, health: stats.health === "DELAYED" ? "Needs attention" : stats.health === "AT_RISK" ? "Watching closely" : "On track",
    milestones: p.milestones.map((m) => ({ name: m.name, date: m.date, done: m.done })),
    recentlyCompleted: done.map((t) => ({ title: t.title, at: t.completedAt })),
  });
});
