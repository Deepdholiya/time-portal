import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Deterministic random so every seed produces the same demo data.
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const iso = (dt: Date) => dt.toISOString().slice(0, 10);
const D = (s: string) => new Date(s + "T00:00:00Z");
const addDays = (s: string, n: number) => { const x = D(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const now = new Date();
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const weekStart = (s: string) => { const wd = (D(s).getUTCDay() + 6) % 7; return addDays(s, -wd); };
const DEMO_TEMP = "Kite-4821-Moss"; // temporary password for the seeded pending invitation

async function wipe() {
  // Children first; companies cascade the rest.
  await prisma.notification.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.emailMessage.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
}

type U = { id: number; name: string; key: string };

async function main() {
  await wipe();
  const pw = await bcrypt.hash("password123", 10);

  // ---------------- Company A: Bridge UX ----------------
  const bux = await prisma.company.create({
    data: {
      name: "Bridge UX", slug: "bridge-ux", color: "#5e6ad2", country: "India", timezone: "Asia/Kolkata", currency: "INR",
      settings: JSON.stringify({ taskKey: "BUX", overloadPct: 100, healthyPct: 80, underPct: 60, tempPasswordHours: 72, sessionTimeoutMinutes: 480, enforceAdminMfa: false, aiEnabled: true, allowOverlappingTimers: false, lockApprovedWeeks: true, invitationDays: 7 }),
    },
  });
  const teamDefs = [["Design", "#bb87fc"], ["Engineering", "#26b5ce"], ["QA", "#4cb782"], ["Marketing", "#f2994a"]] as const;
  const teams: Record<string, number> = {};
  for (const [name, color] of teamDefs) teams[name] = (await prisma.team.create({ data: { companyId: bux.id, name, color } })).id;

  const people = [
    ["Aarav Mehta", "admin", "ADMIN", "Operations Head", "Engineering", true, 2400, 4000, "+91 98200 11111"],
    ["Priya Shah", "priya", "MANAGER", "Project Manager", "Design", true, 1800, 3200, "+91 98200 22222"],
    ["Rohan Iyer", "rohan", "MANAGER", "Engineering Manager", "Engineering", true, 2000, 3500, "+91 98200 33333"],
    ["Neha Kapoor", "neha", "EMPLOYEE", "UI Designer", "Design", false, 1100, 2400, "+91 98200 44444"],
    ["Karan Patel", "karan", "EMPLOYEE", "UX Researcher", "Design", false, 1000, 2200, "+91 98200 55555"],
    ["Sneha Rao", "sneha", "EMPLOYEE", "Frontend Developer", "Engineering", false, 1200, 2600, "+91 98200 66666"],
    ["Vikram Singh", "vikram", "EMPLOYEE", "Backend Developer", "Engineering", false, 1300, 2800, "+91 98200 77777"],
    ["Ananya Das", "ananya", "EMPLOYEE", "Mobile Developer", "Engineering", false, 1250, 2700, "+91 98200 88888"],
    ["Arjun Nair", "arjun", "EMPLOYEE", "QA Engineer", "QA", false, 900, 2000, "+91 98200 99999"],
    ["Meera Joshi", "meera", "EMPLOYEE", "Content Strategist", "Marketing", false, 850, 1800, "+91 98200 12345"],
  ] as const;
  const users: Record<string, U> = {};
  for (const [name, key, role, title, team, all, cost, bill, phone] of people) {
    const u = await prisma.user.create({
      data: { name, email: `${key}@example.com`, role, title, passwordHash: pw, weeklyCapacity: 40, costRate: cost, billRate: bill, phone, location: pick(["Mumbai", "Bengaluru", "Pune", "Remote"]), lastLoginAt: new Date(Date.now() - rand() * 5 * 864e5), lastCompanyId: bux.id, emailVerifiedAt: new Date("2026-01-05") },
    });
    await prisma.membership.create({ data: { companyId: bux.id, userId: u.id, teamId: teams[team], allProjects: all } });
    users[key] = { id: u.id, name, key };
  }

  const clientDefs = [
    ["Northwind Bank", "it-projects@northwind.example", "Daniel Fernandes", "+91 22 4000 1000", 3800],
    ["Greenleaf Retail", "digital@greenleaf.example", "Kavya Menon", "+91 80 4100 2000", 3000],
    ["Bridge UX (Internal)", null, null, null, null],
  ] as const;
  const clients: Record<string, number> = {};
  for (const [name, email, contactName, phone, rate] of clientDefs) clients[name] = (await prisma.client.create({ data: { companyId: bux.id, name, email, contactName, phone, rate } })).id;

  const initiatives: Record<string, number> = {};
  for (const [name, color] of [["Client delivery", "#5e6ad2"], ["Brand & growth", "#f2994a"], ["Internal tools", "#4cb782"]] as const) initiatives[name] = (await prisma.initiative.create({ data: { companyId: bux.id, name, color } })).id;

  type Sub = { name: string; start: string; end: string; est: number; team: string[]; work: string[]; tasks: string[]; section: string };
  type Proj = {
    name: string; code: string; client: string; manager: string; start: string; end: string; est: number; color: string; status?: string; priority: string;
    initiative: string; billing: string; rate?: number; budget?: number; tags: string[]; team: string; description: string;
    links: Record<string, unknown>; milestones: [string, string, boolean][]; subs: Sub[];
  };
  const plan: Proj[] = [
    {
      name: "Website Redesign", code: "WEB", client: "Greenleaf Retail", manager: "priya", start: "2026-06-01", end: "2026-11-30", est: 1400, color: "#5e6ad2", priority: "HIGH",
      initiative: "Client delivery", billing: "HOURLY", rate: 3000, budget: 4_200_000, tags: ["ecommerce", "web"], team: "Design",
      description: "Full redesign of the Greenleaf e-commerce website: research, a new design system and a rebuilt storefront.",
      links: { figma: "https://www.figma.com/file/greenleaf-redesign", document: "https://docs.example.com/greenleaf-brief", drive: "https://drive.example.com/greenleaf" },
      milestones: [["Research sign-off", "2026-07-10", true], ["Design system v1", "2026-08-28", true], ["Beta launch", "2026-10-30", false], ["Go live", "2026-11-27", false]],
      subs: [
        { name: "Discovery & Research", start: "2026-06-01", end: "2026-07-15", est: 220, team: ["karan", "neha", "priya"], section: "Research",
          work: ["Stakeholder interviews with the merchandising team", "Synthesised survey responses into themes", "Competitor audit of checkout flows", "Wrote research summary deck", "Usability test sessions on current site"],
          tasks: ["Interview plan", "Survey analysis", "Persona definitions", "Research readout"] },
        { name: "UI Design", start: "2026-07-01", end: "2026-09-30", est: 480, team: ["neha", "karan", "priya"], section: "Design",
          work: ["Designed product listing page variants", "Built components in the design system", "Iterated on checkout mockups after feedback", "Prepared responsive layouts for tablet", "Design review with client"],
          tasks: ["Homepage hi-fi", "PLP and PDP screens", "Checkout flow", "Design system tokens", "Responsive specs"] },
        { name: "Frontend Build", start: "2026-08-15", end: "2026-11-20", est: 700, team: ["sneha", "vikram", "arjun", "rohan"], section: "Build",
          work: ["Implemented product grid with filters", "Hooked cart to the commerce API", "Fixed layout bugs on Safari", "Wrote unit tests for checkout", "Performance tuning of image loading", "Regression testing on staging"],
          tasks: ["Header and navigation", "Product listing", "Cart and checkout", "Accessibility pass", "Performance budget", "Beta QA round"] },
      ],
    },
    {
      name: "Mobile Banking App", code: "NWB", client: "Northwind Bank", manager: "rohan", start: "2026-05-01", end: "2027-02-28", est: 2200, color: "#eb5757", priority: "URGENT",
      initiative: "Client delivery", billing: "HOURLY", rate: 3800, budget: 8_000_000, tags: ["mobile", "fintech"], team: "Engineering",
      description: "New iOS and Android app for Northwind retail customers with payments and card controls.",
      links: { figma: "https://www.figma.com/file/northwind-mobile", document: "https://docs.example.com/northwind-sow" },
      milestones: [["Architecture approved", "2026-05-29", true], ["Login and accounts", "2026-08-14", true], ["Payments MVP", "2026-10-02", false], ["Security audit", "2026-12-11", false], ["Store release", "2027-02-19", false]],
      subs: [
        { name: "iOS App", start: "2026-06-01", end: "2027-02-15", est: 750, team: ["ananya", "arjun", "rohan"], section: "iOS",
          work: ["Built account summary screen in SwiftUI", "Integrated biometric login", "Fixed crash on transaction history", "Pairing session on payment flow", "Updated push notification handling"],
          tasks: ["Biometric login", "Accounts dashboard", "Payments flow", "Push notifications", "App Store assets"] },
        { name: "Android App", start: "2026-06-15", end: "2027-02-15", est: 750, team: ["ananya", "sneha", "arjun"], section: "Android",
          work: ["Implemented Compose screens for transfers", "Fixed keyboard overlap on login", "Added offline caching for balances", "Code review for payments module"],
          tasks: ["Transfers UI", "Offline cache", "Card controls", "Play Store listing"] },
        { name: "Banking API", start: "2026-05-01", end: "2026-12-31", est: 600, team: ["vikram", "rohan", "arjun"], section: "API",
          work: ["Designed payments endpoints", "Wrote integration tests for accounts API", "Investigated latency on statements endpoint", "Set up rate limiting", "Threat modelling session with security team"],
          tasks: ["Accounts API", "Payments API", "Rate limiting", "Audit logging", "Pen-test fixes"] },
      ],
    },
    {
      name: "Brand Refresh", code: "BRD", client: "Greenleaf Retail", manager: "priya", start: "2026-08-01", end: "2026-12-15", est: 400, color: "#bb87fc", priority: "MEDIUM",
      initiative: "Brand & growth", billing: "FIXED", budget: 1_200_000, tags: ["brand", "campaign"], team: "Marketing",
      description: "New visual identity and the launch campaign for Greenleaf's autumn collection.",
      links: { figma: "https://www.figma.com/file/greenleaf-brand", drive: "https://drive.example.com/greenleaf-brand" },
      milestones: [["Moodboards approved", "2026-08-21", true], ["Guidelines delivered", "2026-10-16", false], ["Campaign assets", "2026-11-13", false]],
      subs: [
        { name: "Visual Identity", start: "2026-08-01", end: "2026-10-15", est: 180, team: ["neha", "meera"], section: "Identity",
          work: ["Logo exploration round two", "Colour palette and typography", "Brand guidelines document"], tasks: ["Logo", "Colour and type", "Brand guidelines"] },
        { name: "Campaign Content", start: "2026-09-15", end: "2026-12-15", est: 220, team: ["meera", "karan"], section: "Campaign",
          work: ["Wrote launch blog post", "Social media calendar for November", "Edited product photography captions", "Email campaign copy"], tasks: ["Launch copy", "Social calendar", "Email sequence", "Photo captions"] },
      ],
    },
    {
      name: "Internal Time Portal", code: "ITP", client: "Bridge UX (Internal)", manager: "rohan", start: "2026-09-15", end: "2027-03-31", est: 900, color: "#4cb782", status: "PLANNING", priority: "LOW",
      initiative: "Internal tools", billing: "NON_BILLABLE", tags: ["internal"], team: "Engineering",
      description: "Employee time tracking, analytics and roadmap portal.",
      links: { document: "https://docs.example.com/time-portal-requirements" },
      milestones: [["Requirements signed off", "2026-10-09", false], ["MVP", "2026-12-18", false], ["Analytics and roadmap", "2027-03-26", false]],
      subs: [
        { name: "Portal Backend", start: "2026-09-20", end: "2027-03-15", est: 450, team: ["vikram"], section: "Backend", work: ["Drafted data model for time entries", "Reviewed requirement document"], tasks: ["Data model", "Permissions", "Reports API"] },
        { name: "Portal Frontend", start: "2026-10-01", end: "2027-03-31", est: 450, team: ["sneha", "neha"], section: "Frontend", work: ["Wireframes for timesheet view", "Explored chart library options"], tasks: ["Timesheet wireframes", "Component library"] },
      ],
    },
  ];

  const ops = await prisma.project.create({
    data: { companyId: bux.id, name: "Internal Operations", code: "OPS", clientId: clients["Bridge UX (Internal)"], color: "#95a2b3", status: "ACTIVE", billingType: "NON_BILLABLE", description: "Meetings, hiring, admin and other non-billable work.", startDate: "2026-01-01", endDate: "2026-12-31", tags: JSON.stringify(["internal"]), initiativeId: initiatives["Internal tools"] },
  });
  const internalWork = ["Team standup and planning", "Weekly 1:1s", "Hiring interviews", "Internal knowledge sharing session", "Tooling and environment setup"];

  let number = 1;
  type Slot = { projectId: number; tasks: { id: number; assigneeId: number | null }[]; work: string[]; start: string; end: string; billable: boolean };
  const slots: Record<string, Slot[]> = {};
  const allTasks: { id: number; title: string; projectId: number; assigneeId: number | null; dueDate: string | null; status: string; sub: string }[] = [];
  const projectsByName: Record<string, number> = {};

  for (const p of plan) {
    const parent = await prisma.project.create({
      data: {
        companyId: bux.id, name: p.name, code: p.code, description: p.description, color: p.color, status: p.status ?? "ACTIVE", priority: p.priority,
        startDate: p.start, endDate: p.end, estimatedHours: p.est, clientId: clients[p.client], managerId: users[p.manager].id, teamId: teams[p.team],
        initiativeId: initiatives[p.initiative], billingType: p.billing, hourlyRate: p.rate ?? null, budget: p.budget ?? null, tags: JSON.stringify(p.tags), links: JSON.stringify(p.links),
        notes: `## ${p.name}\n\n${p.description}\n\n### Working agreements\n- Weekly client check-in on Thursdays\n- Log time daily with a clear description\n- Raise blockers in the task comments`,
      },
    });
    projectsByName[p.name] = parent.id;
    const milestoneIds: number[] = [];
    for (const [name, date, done] of p.milestones) milestoneIds.push((await prisma.milestone.create({ data: { projectId: parent.id, name, date, done } })).id);
    const members = new Set<number>([users[p.manager].id]);
    for (const sp of p.subs) {
      const sub = await prisma.project.create({
        data: { companyId: bux.id, name: sp.name, color: p.color, startDate: sp.start, endDate: sp.end, estimatedHours: sp.est, clientId: clients[p.client], parentId: parent.id, managerId: users[p.manager].id, status: p.status ?? "ACTIVE", billingType: p.billing, hourlyRate: p.rate ?? null },
      });
      sp.team.forEach((k) => members.add(users[k].id));
      const span = (D(sp.end).getTime() - D(sp.start).getTime()) / 864e5;
      const created: { id: number; assigneeId: number | null }[] = [];
      let prev: { id: number; due: string } | null = null;
      for (const [i, title] of sp.tasks.entries()) {
        const startOff = Math.round((span * i) / sp.tasks.length);
        const dueOff = Math.round((span * (i + 1)) / sp.tasks.length);
        const startDate = addDays(sp.start, startOff), dueDate = addDays(sp.start, dueOff);
        const assignee = users[sp.team[i % sp.team.length]].id;
        const status = dueDate < addDays(TODAY, -10) ? "DONE" : startDate <= TODAY ? pick(["IN_PROGRESS", "IN_PROGRESS", "IN_REVIEW", "TODO"]) : pick(["TODO", "BACKLOG"]);
        const milestoneId = milestoneIds.find((_m, mi) => p.milestones[mi][1] >= dueDate) ?? null;
        const t = await prisma.task.create({
          data: {
            companyId: bux.id, number: number++, title, projectId: sub.id, assigneeId: assignee, creatorId: users[p.manager].id, status, priority: pick(["URGENT", "HIGH", "MEDIUM", "MEDIUM", "LOW"]),
            section: sp.section, startDate, dueDate, estimateHours: Math.round(8 + rand() * 32), billable: p.billing !== "NON_BILLABLE", milestoneId,
            description: `${title} for ${sp.name}.\n\nAcceptance criteria:\n- Reviewed by ${users[p.manager].name}\n- Matches the agreed specs\n- Linked time logged daily`,
            tags: JSON.stringify(rand() > 0.6 ? [pick(["client-facing", "tech-debt", "quick-win", "needs-review"])] : []),
            customFields: JSON.stringify({ Sprint: pick(["Sprint 18", "Sprint 19", "Sprint 20"]), "Story points": pick([1, 2, 3, 5, 8]) }),
            completedAt: status === "DONE" ? new Date(dueDate + "T12:00:00Z") : null, sortOrder: i,
          },
        });
        await prisma.taskFollower.createMany({ data: [{ taskId: t.id, userId: assignee }, ...(assignee !== users[p.manager].id ? [{ taskId: t.id, userId: users[p.manager].id }] : [])] });
        await prisma.taskActivity.create({ data: { taskId: t.id, actorId: users[p.manager].id, action: "created", createdAt: new Date(startDate + "T09:00:00Z") } });
        // Sequential tasks in a workstream depend on the previous one.
        if (prev && i % 2 === 1) await prisma.taskDependency.create({ data: { blockerId: prev.id, blockedId: t.id } });
        prev = { id: t.id, due: dueDate };
        created.push({ id: t.id, assigneeId: assignee });
        allTasks.push({ id: t.id, title, projectId: sub.id, assigneeId: assignee, dueDate, status, sub: sp.name });
        // A couple of subtasks on in-flight work.
        if (status !== "DONE" && rand() > 0.5) {
          for (const [j, st] of ["Draft", "Review with lead", "Final polish"].entries()) {
            await prisma.task.create({ data: { companyId: bux.id, number: number++, title: `${st}: ${title}`, projectId: sub.id, parentId: t.id, assigneeId: assignee, creatorId: assignee, status: j === 0 ? "DONE" : "TODO", priority: "NONE", estimateHours: 3, completedAt: j === 0 ? new Date() : null, sortOrder: j } });
          }
        }
      }
      for (const k of sp.team) {
        (slots[k] ??= []).push({ projectId: sub.id, tasks: created, work: sp.work, start: sp.start, end: sp.end < TODAY ? sp.end : TODAY, billable: p.billing !== "NON_BILLABLE" });
      }
    }
    for (const userId of members) await prisma.projectMember.create({ data: { projectId: parent.id, userId } });
  }

  // A deliberate dependency conflict for the roadmap: payments flow scheduled to start before the API is done.
  const paymentsApi = allTasks.find((t) => t.title === "Payments API")!;
  const paymentsFlow = allTasks.find((t) => t.title === "Payments flow")!;
  await prisma.task.update({ where: { id: paymentsApi.id }, data: { dueDate: addDays(TODAY, 12), status: "IN_PROGRESS", completedAt: null } });
  await prisma.task.update({ where: { id: paymentsFlow.id }, data: { startDate: addDays(TODAY, 5), dueDate: addDays(TODAY, 25), status: "TODO" } });
  await prisma.taskDependency.create({ data: { blockerId: paymentsApi.id, blockedId: paymentsFlow.id } });
  // Overdue and blocked examples, plus one due today for the dashboard.
  const overdue = allTasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate > TODAY).slice(0, 3);
  for (const [i, t] of overdue.entries()) await prisma.task.update({ where: { id: t.id }, data: { dueDate: addDays(TODAY, -(i + 2)), status: "IN_PROGRESS" } });
  const blocked = allTasks.find((t) => t.title === "Rate limiting")!;
  await prisma.task.update({ where: { id: blocked.id }, data: { status: "BLOCKED" } });
  const nehaToday = allTasks.find((t) => t.title === "Brand guidelines")!;
  await prisma.task.update({ where: { id: nehaToday.id }, data: { dueDate: TODAY, startDate: addDays(TODAY, -7), status: "IN_PROGRESS", completedAt: null } });
  // A recurring internal task.
  await prisma.task.create({ data: { companyId: bux.id, number: number++, title: "Weekly client status report", projectId: projectsByName["Website Redesign"], assigneeId: users.priya.id, creatorId: users.priya.id, status: "TODO", priority: "MEDIUM", recurrence: "WEEKLY", dueDate: addDays(weekStart(TODAY), 4), estimateHours: 1, section: "Research" } });

  for (const k of Object.keys(users)) (slots[k] ??= []).push({ projectId: ops.id, tasks: [], work: internalWork, start: "2026-01-01", end: TODAY, billable: false });

  // Comments with mentions on a few active tasks.
  const talk = [
    ["priya", "Can we get this ready for Thursday's client check-in? @neha the latest mocks would help."],
    ["neha", "Uploading the updated frames today. I changed the spacing on the cards as discussed."],
    ["rohan", "Blocked on the payments contract from Northwind's side. @vikram can you follow up with their API team?"],
    ["vikram", "Followed up. They expect to share the sandbox keys by Monday."],
    ["arjun", "Found two regressions on Safari 17, logged them as subtasks."],
  ] as const;
  const active = allTasks.filter((t) => t.status !== "DONE").slice(0, 10);
  for (const [i, t] of active.entries()) {
    for (const [who, body] of talk.slice(i % 3, (i % 3) + 2)) {
      const mentions = [...body.matchAll(/@(\w+)/g)].map((m) => users[m[1]]?.id).filter(Boolean);
      await prisma.comment.create({ data: { taskId: t.id, userId: users[who].id, body, mentions: JSON.stringify(mentions), createdAt: new Date(Date.now() - (5 - i * 0.3) * 864e5) } });
    }
  }

  // ---- Time entries from four months back to yesterday ----
  const startDate = addDays(TODAY, -125);
  const entries: Prisma.TimeEntryCreateManyInput[] = [];
  for (const [k, u] of Object.entries(users)) {
    for (let day = startDate; day < TODAY; day = addDays(day, 1)) {
      const wd = D(day).getUTCDay();
      if (wd === 0 || wd === 6 || rand() < 0.04) continue;
      const open = slots[k].filter((sl) => sl.start <= day && sl.end >= day);
      if (!open.length) continue;
      let cursor = 9 * 60 + 30;
      const target = 6 * 60 + Math.round(rand() * 150);
      let logged = 0;
      while (logged < target) {
        const sl = rand() < 0.15 ? open.find((o) => o.projectId === ops.id) ?? pick(open) : pick(open.filter((o) => o.projectId !== ops.id).length ? open.filter((o) => o.projectId !== ops.id) : open);
        const minutes = Math.min(target - logged, 30 + Math.round(rand() * 6) * 30);
        if (minutes < 15) break;
        const mine = sl.tasks.filter((t) => t.assigneeId === u.id);
        const task = mine.length && rand() < 0.85 ? pick(mine) : sl.tasks.length && rand() < 0.4 ? pick(sl.tasks) : null;
        entries.push({ companyId: bux.id, userId: u.id, projectId: sl.projectId, taskId: task?.id ?? null, date: day, startTime: hhmm(cursor), endTime: hhmm(cursor + minutes), minutes, description: pick(sl.work), billable: sl.billable });
        cursor += minutes + (rand() < 0.3 ? 30 : 0);
        if (cursor > 13 * 60 && cursor < 14 * 60) cursor = 14 * 60;
        logged += minutes;
      }
    }
  }
  for (let i = 0; i < entries.length; i += 500) await prisma.timeEntry.createMany({ data: entries.slice(i, i + 500) });

  // Estimates that match the history so health and variance look realistic.
  for (const p of await prisma.project.findMany({ where: { companyId: bux.id, parentId: null } })) {
    const ids = (await prisma.project.findMany({ where: { OR: [{ id: p.id }, { parentId: p.id }] }, select: { id: true } })).map((x) => x.id);
    const minutes = (await prisma.timeEntry.aggregate({ where: { projectId: { in: ids } }, _sum: { minutes: true } }))._sum.minutes ?? 0;
    const total = Math.max(1, (p.endDate ? D(p.endDate).getTime() : 0) - (p.startDate ? D(p.startDate).getTime() : 0));
    const elapsed = Math.max(0.05, Math.min(1, (Date.now() - (p.startDate ? D(p.startDate).getTime() : Date.now())) / total));
    const factor = p.name === "Mobile Banking App" ? 0.92 : 1.12;
    const est = Math.round((minutes / 60 / elapsed) * factor / 10) * 10 || null;
    if (p.id !== ops.id) await prisma.project.update({ where: { id: p.id }, data: { estimatedHours: est } });
  }

  // ---- Timesheets: earlier weeks approved, last week submitted except a few ----
  const lastWeek = addDays(weekStart(TODAY), -7);
  for (const [k, u] of Object.entries(users)) {
    for (let w = 6; w >= 2; w--) {
      const ws = addDays(weekStart(TODAY), -7 * w);
      await prisma.timesheetPeriod.create({ data: { companyId: bux.id, userId: u.id, weekStart: ws, status: "APPROVED", submittedAt: new Date(addDays(ws, 5) + "T10:00:00Z"), reviewedAt: new Date(addDays(ws, 7) + "T10:00:00Z"), reviewedById: k === "priya" ? users.rohan.id : users.priya.id } });
    }
    if (k === "sneha") await prisma.timesheetPeriod.create({ data: { companyId: bux.id, userId: u.id, weekStart: lastWeek, status: "REJECTED", note: "Tuesday has 3h on Cart and checkout with no description of what changed. Please add detail.", submittedAt: new Date(addDays(lastWeek, 5) + "T10:00:00Z"), reviewedAt: new Date(), reviewedById: users.rohan.id } });
    else if (!["admin", "arjun", "neha"].includes(k)) await prisma.timesheetPeriod.create({ data: { companyId: bux.id, userId: u.id, weekStart: lastWeek, status: "SUBMITTED", submittedAt: new Date(addDays(lastWeek, 5) + "T10:00:00Z") } });
  }

  // ---- Leave and holidays ----
  for (const [date, name] of [["2026-10-02", "Gandhi Jayanti"], ["2026-10-20", "Dussehra"], ["2026-11-09", "Diwali"], ["2026-12-25", "Christmas"]] as const) await prisma.holiday.create({ data: { companyId: bux.id, date, name } });
  await prisma.leaveRequest.create({ data: { companyId: bux.id, userId: users.karan.id, type: "VACATION", from: addDays(TODAY, 6), to: addDays(TODAY, 10), reason: "Family trip", status: "PENDING" } });
  await prisma.leaveRequest.create({ data: { companyId: bux.id, userId: users.meera.id, type: "SICK", from: addDays(TODAY, -15), to: addDays(TODAY, -14), status: "APPROVED", reviewedById: users.priya.id } });
  await prisma.leaveRequest.create({ data: { companyId: bux.id, userId: users.ananya.id, type: "VACATION", from: addDays(TODAY, 14), to: addDays(TODAY, 18), status: "APPROVED", reviewedById: users.rohan.id } });
  await prisma.leaveRequest.create({ data: { companyId: bux.id, userId: users.neha.id, type: "PERSONAL", from: addDays(TODAY, 20), to: addDays(TODAY, 20), halfDay: true, status: "PENDING", reason: "Appointment" } });

  // ---- Custom fields, templates, automations, saved report ----
  await prisma.customField.create({ data: { companyId: bux.id, name: "Sprint", type: "SELECT", options: JSON.stringify(["Sprint 18", "Sprint 19", "Sprint 20", "Sprint 21"]) } });
  await prisma.customField.create({ data: { companyId: bux.id, name: "Story points", type: "NUMBER" } });
  await prisma.template.create({ data: { companyId: bux.id, kind: "TASK", name: "Design review", payload: JSON.stringify({ title: "Design review", priority: "MEDIUM", estimateHours: 4, billable: true, tags: ["needs-review"], subtasks: [{ title: "Prepare frames", estimateHours: 2 }, { title: "Review call", estimateHours: 1 }, { title: "Capture feedback", estimateHours: 1 }] }) } });
  await prisma.template.create({
    data: {
      companyId: bux.id, kind: "PROJECT", name: "Website project (12 weeks)",
      payload: JSON.stringify({
        description: "Standard discovery → design → build website engagement.", estimatedHours: 900, billingType: "HOURLY", durationDays: 84,
        subprojects: [{ name: "Discovery" }, { name: "Design" }, { name: "Build" }],
        milestones: [{ name: "Research sign-off", offsetDays: 14 }, { name: "Designs approved", offsetDays: 42 }, { name: "Launch", offsetDays: 84 }],
        tasks: [
          { ref: 1, title: "Kickoff workshop", section: "Discovery", priority: "HIGH", estimateHours: 6, startOffset: 0, dueOffset: 2, sub: "Discovery", blockedByRefs: [] },
          { ref: 2, title: "Stakeholder interviews", section: "Discovery", priority: "MEDIUM", estimateHours: 16, startOffset: 3, dueOffset: 12, sub: "Discovery", blockedByRefs: [1] },
          { ref: 3, title: "Wireframes", section: "Design", priority: "MEDIUM", estimateHours: 40, startOffset: 14, dueOffset: 28, sub: "Design", blockedByRefs: [2] },
          { ref: 4, title: "Visual design", section: "Design", priority: "HIGH", estimateHours: 80, startOffset: 28, dueOffset: 42, sub: "Design", blockedByRefs: [3] },
          { ref: 5, title: "Frontend build", section: "Build", priority: "HIGH", estimateHours: 200, startOffset: 42, dueOffset: 77, sub: "Build", blockedByRefs: [4] },
          { ref: 6, title: "QA and launch", section: "Build", priority: "URGENT", estimateHours: 40, startOffset: 77, dueOffset: 84, sub: "Build", blockedByRefs: [5] },
        ],
      }),
    },
  });
  await prisma.automation.create({ data: { companyId: bux.id, name: "Remind people to submit timesheets", trigger: "TIMESHEET_REMINDER", config: "{}" } });
  await prisma.automation.create({ data: { companyId: bux.id, name: "Tell the project manager about overdue tasks", trigger: "TASK_OVERDUE", config: JSON.stringify({ notifyManager: true }) } });
  await prisma.automation.create({ data: { companyId: bux.id, name: "Notify the manager when work is ready for review", trigger: "TASK_STATUS", config: JSON.stringify({ status: "IN_REVIEW", notify: "manager" }) } });
  await prisma.automation.create({ data: { companyId: bux.id, name: "Due soon reminder", trigger: "DUE_SOON", config: JSON.stringify({ days: 1 }) } });
  await prisma.savedReport.create({ data: { companyId: bux.id, userId: users.priya.id, name: "Weekly Greenleaf hours", schedule: "WEEKLY", nextRunAt: new Date(Date.now() + 3 * 864e5), config: JSON.stringify({ preset: "Last week", filters: { clientId: String(clients["Greenleaf Retail"]) }, config: { groupBy: ["project", "employee"], chart: "bar", chartBy: "day" } }) } });

  // ---- Invitations: one pending with a known temporary password, one expired, one revoked ----
  const pending = await prisma.user.create({ data: { name: "Rahul Verma", email: "rahul@example.com", role: "EMPLOYEE", title: "Frontend Developer", status: "INVITED", mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + 3 * 864e5), passwordHash: await bcrypt.hash(DEMO_TEMP, 10), lastCompanyId: bux.id } });
  await prisma.membership.create({ data: { companyId: bux.id, userId: pending.id, teamId: teams.Engineering } });
  await prisma.projectMember.create({ data: { projectId: projectsByName["Website Redesign"], userId: pending.id } });
  await prisma.invitation.create({ data: { companyId: bux.id, userId: pending.id, email: pending.email, name: pending.name, role: "EMPLOYEE", title: pending.title, teamId: teams.Engineering, projectIds: JSON.stringify([projectsByName["Website Redesign"]]), expiresAt: pending.tempPasswordExpiresAt!, invitedById: users.admin.id } });
  const expired = await prisma.user.create({ data: { name: "Dev Malhotra", email: "dev@example.com", role: "EMPLOYEE", title: "QA Engineer", status: "INVITED", mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() - 2 * 864e5), passwordHash: await bcrypt.hash("Expired-0000-Temp", 10), lastCompanyId: bux.id } });
  await prisma.membership.create({ data: { companyId: bux.id, userId: expired.id, teamId: teams.QA } });
  await prisma.invitation.create({ data: { companyId: bux.id, userId: expired.id, email: expired.email, name: expired.name, role: "EMPLOYEE", teamId: teams.QA, expiresAt: expired.tempPasswordExpiresAt!, invitedById: users.admin.id, createdAt: new Date(Date.now() - 6 * 864e5) } });
  await prisma.emailMessage.create({ data: { companyId: bux.id, kind: "INVITATION", to: pending.email, subject: "You're invited to Bridge UX on Time Portal", body: `Hi Rahul Verma,\n\nAarav Mehta invited you to Bridge UX on Time Portal as employee.\n\nSign in at: http://localhost:5173/login\nEmail: rahul@example.com\nTemporary password: •••••• (shown once to the inviter)\n\nYou'll be asked to choose your own password the first time you sign in.`, sentById: users.admin.id, sentAt: new Date() } });

  // ---- Notifications so the inbox isn't empty ----
  await prisma.notification.createMany({
    data: [
      { companyId: bux.id, userId: users.neha.id, type: "MENTION", title: "Priya Shah mentioned you on \"Homepage hi-fi\"", body: talk[0][1], link: `/tasks/${active[0].id}` },
      { companyId: bux.id, userId: users.sneha.id, type: "TIMESHEET_REJECTED", title: `Your week of ${lastWeek} was sent back`, body: "Tuesday has 3h on Cart and checkout with no description of what changed. Please add detail.", link: `/timesheet?week=${lastWeek}` },
      { companyId: bux.id, userId: users.rohan.id, type: "PROJECT_AT_RISK", title: "Mobile Banking App is at risk", body: "1 dependency conflict · 1 blocked", link: `/projects/${projectsByName["Mobile Banking App"]}` },
      { companyId: bux.id, userId: users.priya.id, type: "LEAVE_REQUESTED", title: "Karan Patel requested leave", link: "/approvals?tab=leave" },
    ],
  });

  // ---------------- Company B: Northwind Studio (separate tenant) ----------------
  const nws = await prisma.company.create({
    data: { name: "Northwind Studio", slug: "northwind-studio", color: "#26b5ce", country: "United States", timezone: "America/New_York", currency: "USD", workWeek: "1,2,3,4,5", settings: JSON.stringify({ taskKey: "NWS" }) },
  });
  const studio = (await prisma.team.create({ data: { companyId: nws.id, name: "Studio", color: "#26b5ce" } })).id;
  const tom = await prisma.user.create({ data: { name: "Tom Becker", email: "tom@example.com", role: "MANAGER", title: "Studio Lead", passwordHash: pw, costRate: 60, billRate: 150, lastCompanyId: nws.id } });
  const lisa = await prisma.user.create({ data: { name: "Lisa Chen", email: "lisa@example.com", role: "EMPLOYEE", title: "Motion Designer", passwordHash: pw, costRate: 45, billRate: 120, lastCompanyId: nws.id } });
  for (const u of [tom, lisa]) await prisma.membership.create({ data: { companyId: nws.id, userId: u.id, teamId: studio } });
  // Shared staff: the admin and Priya also work in the studio.
  await prisma.membership.create({ data: { companyId: nws.id, userId: users.admin.id } });
  await prisma.membership.create({ data: { companyId: nws.id, userId: users.priya.id, teamId: studio } });
  const acme = await prisma.client.create({ data: { companyId: nws.id, name: "Acme Outdoors", email: "marketing@acme.example", contactName: "Jordan Lee", phone: "+1 212 555 0100", rate: 140 } });
  const promo = await prisma.project.create({ data: { companyId: nws.id, name: "Spring Promo Video", code: "SPV", clientId: acme.id, managerId: tom.id, color: "#26b5ce", startDate: addDays(TODAY, -40), endDate: addDays(TODAY, 30), estimatedHours: 160, billingType: "HOURLY", hourlyRate: 140, budget: 22400 } });
  await prisma.milestone.create({ data: { projectId: promo.id, name: "Storyboard approved", date: addDays(TODAY, -20), done: true } });
  await prisma.milestone.create({ data: { projectId: promo.id, name: "Final cut", date: addDays(TODAY, 25), done: false } });
  for (const u of [tom, lisa, { id: users.priya.id }]) await prisma.projectMember.create({ data: { projectId: promo.id, userId: u.id } });
  let n2 = 1;
  const nwsTasks = [];
  for (const [title, who, status] of [["Storyboard", lisa.id, "DONE"], ["Animatics", lisa.id, "IN_PROGRESS"], ["Voice-over script", users.priya.id, "IN_REVIEW"], ["Color grade", lisa.id, "TODO"]] as const) {
    nwsTasks.push(await prisma.task.create({ data: { companyId: nws.id, number: n2++, title, projectId: promo.id, assigneeId: who, creatorId: tom.id, status, priority: "MEDIUM", estimateHours: 20, startDate: addDays(TODAY, -30 + n2 * 8), dueDate: addDays(TODAY, -20 + n2 * 10), completedAt: status === "DONE" ? new Date() : null } }));
  }
  const nwsEntries: Prisma.TimeEntryCreateManyInput[] = [];
  for (let day = addDays(TODAY, -35); day < TODAY; day = addDays(day, 1)) {
    const wd = D(day).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    nwsEntries.push({ companyId: nws.id, userId: lisa.id, projectId: promo.id, taskId: pick(nwsTasks).id, date: day, minutes: 300 + Math.round(rand() * 120), description: pick(["Animating product shots", "Storyboard revisions", "Render and export review"]), billable: true });
    if (rand() > 0.6) nwsEntries.push({ companyId: nws.id, userId: users.priya.id, projectId: promo.id, taskId: nwsTasks[2].id, date: day, minutes: 60, description: "Script edits with client feedback", billable: true });
  }
  await prisma.timeEntry.createMany({ data: nwsEntries });

  await prisma.auditLog.create({ data: { companyId: bux.id, userId: users.admin.id, action: "seeded", entity: "company", entityId: bux.id, newValue: JSON.stringify({ note: "Demo data loaded" }) } });

  console.log(`Seeded ${entries.length + nwsEntries.length} time entries and ${number - 1 + n2 - 1} tasks across 2 companies.`);
  console.log("Sign in with admin@example.com (admin), priya@example.com or rohan@example.com (managers), neha@example.com (employee). Password: password123");
  console.log(`Pending invitation: rahul@example.com with temporary password ${DEMO_TEMP}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
