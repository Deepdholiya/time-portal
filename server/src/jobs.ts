// Background checks that create notifications, deliver scheduled reports and run automations.
import { prisma, notify, companySettings, parseJson } from "./db.js";
import { projectStats } from "./health.js";
import { sendMail, appUrl } from "./mail.js";
import { nextRun } from "./routes/reports.js";
import { addDays, today, weekStartOf, weekday, zonedNow } from "./weeks.js";
import { autoSubmitDue } from "./days.js";

type Rule = { trigger: string; config: Record<string, unknown>; id: number };

async function rules(companyId: number) {
  const rows = await prisma.automation.findMany({ where: { companyId, enabled: true } });
  return rows.map((r) => ({ id: r.id, trigger: r.trigger, config: parseJson<Record<string, unknown>>(r.config, {}) }));
}
const bump = (id: number) => prisma.automation.update({ where: { id }, data: { runs: { increment: 1 } } });

export async function runChecks() {
  const t0 = today();
  const companies = await prisma.company.findMany({ where: { status: "ACTIVE" } });
  for (const c of companies) {
    const key = companySettings(c).taskKey;
    const auto = await rules(c.id);
    const dueSoonDays = Number(auto.find((r) => r.trigger === "DUE_SOON")?.config.days ?? 1);

    // Due soon and overdue tasks.
    const open = await prisma.task.findMany({ where: { companyId: c.id, status: { not: "DONE" }, assigneeId: { not: null }, dueDate: { not: null, lte: addDays(t0, dueSoonDays) } }, include: { project: { select: { managerId: true } } } });
    for (const t of open) {
      if (t.dueDate! >= t0) {
        await notify([t.assigneeId], { companyId: c.id, type: "DUE_SOON", title: `${key}-${t.number} "${t.title}" is due ${t.dueDate === t0 ? "today" : t.dueDate}`, link: `/tasks/${t.id}`, dedupeKey: `due:${t.id}:${t.dueDate}` });
      } else {
        const overdueRule = auto.find((r) => r.trigger === "TASK_OVERDUE");
        const recipients = [t.assigneeId, ...(overdueRule?.config.notifyManager ? [t.project.managerId] : [])];
        await notify(recipients, { companyId: c.id, type: "OVERDUE", title: `${key}-${t.number} "${t.title}" is overdue (was due ${t.dueDate})`, link: `/tasks/${t.id}`, dedupeKey: `overdue:${t.id}:${t.dueDate}` });
        if (overdueRule) await bump(overdueRule.id);
      }
    }

    // Milestones approaching in the next 3 days.
    const ms = await prisma.milestone.findMany({ where: { done: false, date: { gte: t0, lte: addDays(t0, 3) }, project: { companyId: c.id, archived: false } }, include: { project: { include: { members: true } } } });
    for (const m of ms) {
      await notify([m.project.managerId, ...m.project.members.map((x) => x.userId)], { companyId: c.id, type: "MILESTONE", title: `Milestone "${m.name}" on ${m.project.name} is due ${m.date}`, link: `/projects/${m.project.id}`, dedupeKey: `milestone:${m.id}:${m.date}` });
    }

    // Projects at risk: tell the manager once a week while it stays at risk.
    const stats = await projectStats(c.id);
    const projects = await prisma.project.findMany({ where: { companyId: c.id, parentId: null, archived: false, status: { not: "COMPLETED" } }, select: { id: true, name: true, managerId: true } });
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE", memberships: { some: { companyId: c.id } } }, select: { id: true } });
    for (const p of projects) {
      const s = stats.get(p.id);
      if (!s || s.health === "ON_TRACK") continue;
      await notify([p.managerId ?? admins[0]?.id], { companyId: c.id, type: "PROJECT_AT_RISK", title: `${p.name} is ${s.health === "DELAYED" ? "delayed" : "at risk"}`, body: s.reasons.slice(0, 3).join(" · "), link: `/projects/${p.id}`, dedupeKey: `risk:${p.id}:${s.health}:${weekStartOf(t0)}` });
    }

    // Days that reached the submission cutoff are submitted; failures notify the employee.
    await autoSubmitDue(c);

    // Reminder: the previous working day has no time logged.
    const workDays = c.workWeek.split(",").map(Number);
    const reminderRule = auto.find((r) => r.trigger === "TIMESHEET_REMINDER");
    const localToday = zonedNow(c.timezone).date;
    let prev = addDays(localToday, -1);
    while (!workDays.includes(weekday(prev))) prev = addDays(prev, -1);
    if (reminderRule && workDays.includes(weekday(localToday))) {
      const members = await prisma.membership.findMany({ where: { companyId: c.id, user: { status: "ACTIVE" } }, select: { userId: true } });
      const logged = new Set((await prisma.timeEntry.groupBy({ by: ["userId"], where: { companyId: c.id, date: prev } })).map((g) => g.userId));
      const onLeave = new Set((await prisma.leaveRequest.findMany({ where: { companyId: c.id, status: "APPROVED", from: { lte: prev }, to: { gte: prev } }, select: { userId: true } })).map((l) => l.userId));
      const pending = members.map((m) => m.userId).filter((u) => !logged.has(u) && !onLeave.has(u));
      await notify(pending, { companyId: c.id, type: "TIMESHEET_REMINDER", title: `You haven't logged any time for ${prev}`, link: `/timesheet?from=${prev}&to=${prev}`, dedupeKey: `ts:${prev}` });
      await bump(reminderRule.id);
    }
  }

  // Scheduled reports that are due.
  const due = await prisma.savedReport.findMany({ where: { schedule: { not: null }, nextRunAt: { lte: new Date() } }, include: { user: true, company: true } });
  for (const r of due) {
    await notify([r.userId], { companyId: r.companyId, type: "REPORT_READY", title: `Your ${r.schedule!.toLowerCase()} report "${r.name}" is ready`, link: `/reports?saved=${r.id}`, dedupeKey: `report:${r.id}:${r.nextRunAt?.toISOString()}` });
    await sendMail({ companyId: r.companyId, kind: "REPORT", to: r.user.email, subject: `${r.name} (${r.company.name})`, body: `Your scheduled report "${r.name}" is ready.\n\nOpen it: ${appUrl()}/reports?saved=${r.id}` });
    await prisma.savedReport.update({ where: { id: r.id }, data: { lastRunAt: new Date(), nextRunAt: nextRun(r.schedule!) } });
  }
}

// Event-driven automation: "when a task moves to <status>, notify <who>".
export async function onTaskStatus(companyId: number, task: { id: number; number: number; title: string; status: string; creatorId: number | null; projectId: number }, actorId: number) {
  const auto = (await rules(companyId)).filter((r: Rule) => r.trigger === "TASK_STATUS" && r.config.status === task.status);
  for (const r of auto) {
    const project = await prisma.project.findUnique({ where: { id: task.projectId }, select: { managerId: true, parent: { select: { managerId: true } } } });
    const who = r.config.notify === "creator" ? [task.creatorId] : [project?.managerId ?? project?.parent?.managerId];
    await notify(who.filter((u) => u !== actorId), { companyId, type: "AUTOMATION", title: `"${task.title}" moved to ${task.status.replace("_", " ").toLowerCase()}`, link: `/tasks/${task.id}` });
    await bump(r.id);
  }
}

export function startJobs() {
  const tick = () => runChecks().catch((e) => console.error("Background checks failed", e));
  setTimeout(tick, 5_000);
  setInterval(tick, 5 * 60_000);
}
