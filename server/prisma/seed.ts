import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Deterministic random so every seed produces the same demo data.
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const d = (iso: string) => new Date(iso + "T00:00:00Z");
const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.timesheetPeriod.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.task.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.rolePermission.deleteMany();

  const pw = await bcrypt.hash("password123", 10);
  const teams = Object.fromEntries(
    await Promise.all(["Design", "Engineering", "QA", "Marketing"].map(async (name) => [name, await prisma.team.create({ data: { name } })])),
  );

  const people = [
    ["Aarav Mehta", "admin@example.com", "ADMIN", "Operations Head", "Engineering", true],
    ["Priya Shah", "priya@example.com", "MANAGER", "Project Manager", "Design", true],
    ["Rohan Iyer", "rohan@example.com", "MANAGER", "Engineering Manager", "Engineering", true],
    ["Neha Kapoor", "neha@example.com", "EMPLOYEE", "UI Designer", "Design", false],
    ["Karan Patel", "karan@example.com", "EMPLOYEE", "UX Researcher", "Design", false],
    ["Sneha Rao", "sneha@example.com", "EMPLOYEE", "Frontend Developer", "Engineering", false],
    ["Vikram Singh", "vikram@example.com", "EMPLOYEE", "Backend Developer", "Engineering", false],
    ["Ananya Das", "ananya@example.com", "EMPLOYEE", "Mobile Developer", "Engineering", false],
    ["Arjun Nair", "arjun@example.com", "EMPLOYEE", "QA Engineer", "QA", false],
    ["Meera Joshi", "meera@example.com", "EMPLOYEE", "Content Strategist", "Marketing", false],
  ] as const;
  const users: Record<string, { id: number; name: string }> = {};
  for (const [name, email, role, title, team, all] of people) {
    users[email.split("@")[0]] = await prisma.user.create({
      data: { name, email, role, title, passwordHash: pw, teamId: teams[team].id, allProjects: all, weeklyCapacity: 40 },
    });
  }

  const clients = Object.fromEntries(
    await Promise.all(["Northwind Bank", "Greenleaf Retail", "Bridge UX (Internal)"].map(async (name) => [name, await prisma.client.create({ data: { name } })])),
  );

  type Sub = { name: string; start: string; end: string; est: number; color: string; work: string[]; tasks: string[]; team: string[] };
  type Proj = { name: string; code: string; client: string; manager: string; start: string; end: string; est: number; color: string; status?: string; health?: string; description: string; milestones: [string, string, boolean][]; subs: Sub[] };

  const plan: Proj[] = [
    {
      name: "Website Redesign", code: "WEB", client: "Greenleaf Retail", manager: "priya", start: "2026-06-01", end: "2026-11-30", est: 1400, color: "#2a78d6",
      description: "Full redesign of the Greenleaf e-commerce website.", health: "ON_TRACK",
      milestones: [["Research sign-off", "2026-07-10", true], ["Design system v1", "2026-08-28", true], ["Beta launch", "2026-10-30", false], ["Go live", "2026-11-27", false]],
      subs: [
        { name: "Discovery & Research", start: "2026-06-01", end: "2026-07-15", est: 220, color: "#6366f1", team: ["karan", "neha", "priya"],
          work: ["Stakeholder interviews with the merchandising team", "Synthesised survey responses into themes", "Competitor audit of checkout flows", "Wrote research summary deck", "Usability test sessions on current site"],
          tasks: ["Interview plan", "Survey analysis", "Persona definitions"] },
        { name: "UI Design", start: "2026-07-01", end: "2026-09-30", est: 480, color: "#8b5cf6", team: ["neha", "karan", "priya"],
          work: ["Designed product listing page variants", "Built components in the design system", "Iterated on checkout mockups after feedback", "Prepared responsive layouts for tablet", "Design review with client"],
          tasks: ["Homepage hi-fi", "PLP and PDP screens", "Checkout flow", "Design system tokens"] },
        { name: "Frontend Build", start: "2026-08-15", end: "2026-11-20", est: 700, color: "#a855f7", team: ["sneha", "vikram", "arjun", "rohan"],
          work: ["Implemented product grid with filters", "Hooked cart to the commerce API", "Fixed layout bugs on Safari", "Wrote unit tests for checkout", "Performance tuning of image loading", "Regression testing on staging"],
          tasks: ["Header and navigation", "Product listing", "Cart and checkout", "Accessibility pass"] },
      ],
    },
    {
      name: "Mobile Banking App", code: "NWB", client: "Northwind Bank", manager: "rohan", start: "2026-05-01", end: "2027-02-28", est: 2200, color: "#eb6834",
      description: "New iOS and Android app for Northwind retail customers.", health: "AT_RISK",
      milestones: [["Architecture approved", "2026-05-29", true], ["Login and accounts", "2026-08-14", true], ["Payments MVP", "2026-10-23", false], ["Security audit", "2026-12-11", false], ["Store release", "2027-02-19", false]],
      subs: [
        { name: "iOS App", start: "2026-06-01", end: "2027-02-15", est: 750, color: "#06b6d4", team: ["ananya", "arjun", "rohan"],
          work: ["Built account summary screen in SwiftUI", "Integrated biometric login", "Fixed crash on transaction history", "Pairing session on payment flow", "Updated push notification handling"],
          tasks: ["Biometric login", "Accounts dashboard", "Payments flow", "Push notifications"] },
        { name: "Android App", start: "2026-06-15", end: "2027-02-15", est: 750, color: "#0ea5e9", team: ["ananya", "sneha", "arjun"],
          work: ["Implemented Compose screens for transfers", "Fixed keyboard overlap on login", "Added offline caching for balances", "Code review for payments module"],
          tasks: ["Transfers UI", "Offline cache", "Card controls"] },
        { name: "Banking API", start: "2026-05-01", end: "2026-12-31", est: 600, color: "#0284c7", team: ["vikram", "rohan", "arjun"],
          work: ["Designed payments endpoints", "Wrote integration tests for accounts API", "Investigated latency on statements endpoint", "Set up rate limiting", "Threat modelling session with security team"],
          tasks: ["Accounts API", "Payments API", "Rate limiting", "Audit logging"] },
      ],
    },
    {
      name: "Brand Refresh", code: "BRD", client: "Greenleaf Retail", manager: "priya", start: "2026-08-01", end: "2026-12-15", est: 400, color: "#e87ba4",
      description: "New visual identity and campaign launch.", health: "ON_TRACK",
      milestones: [["Moodboards approved", "2026-08-21", true], ["Campaign assets", "2026-11-13", false]],
      subs: [
        { name: "Visual Identity", start: "2026-08-01", end: "2026-10-15", est: 180, color: "#ec4899", team: ["neha", "meera"],
          work: ["Logo exploration round two", "Colour palette and typography", "Brand guidelines document"], tasks: ["Logo", "Brand guidelines"] },
        { name: "Campaign Content", start: "2026-09-15", end: "2026-12-15", est: 220, color: "#f472b6", team: ["meera", "karan"],
          work: ["Wrote launch blog post", "Social media calendar for November", "Edited product photography captions", "Email campaign copy"], tasks: ["Launch copy", "Social calendar", "Email sequence"] },
      ],
    },
    {
      name: "Internal Time Portal", code: "ITP", client: "Bridge UX (Internal)", manager: "rohan", start: "2026-09-15", end: "2027-03-31", est: 900, color: "#1baf7a", status: "PLANNING",
      description: "Employee time tracking, analytics and roadmap portal.", health: "ON_TRACK",
      milestones: [["Requirements signed off", "2026-10-09", false], ["MVP", "2026-12-18", false], ["Analytics and roadmap", "2027-03-26", false]],
      subs: [
        { name: "Portal Backend", start: "2026-09-20", end: "2027-03-15", est: 450, color: "#22c55e", team: ["vikram"],
          work: ["Drafted data model for time entries", "Reviewed requirement document"], tasks: ["Data model", "Permissions"] },
        { name: "Portal Frontend", start: "2026-10-01", end: "2027-03-31", est: 450, color: "#4ade80", team: ["sneha", "neha"],
          work: ["Wireframes for timesheet view", "Explored chart library options"], tasks: ["Timesheet wireframes"] },
      ],
    },
  ];

  const internalWork = ["Team standup and planning", "Weekly 1:1s", "Hiring interviews", "Internal knowledge sharing session", "Tooling and environment setup"];
  const ops = await prisma.project.create({
    data: { name: "Internal Operations", code: "OPS", clientId: clients["Bridge UX (Internal)"].id, color: "#898781", status: "ACTIVE", description: "Meetings, hiring, admin and other non-billable work.", startDate: d("2026-01-01"), endDate: d("2026-12-31") },
  });

  type Slot = { projectId: number; taskIds: number[]; work: string[]; start: Date; end: Date; billable: boolean };
  const slots: Record<string, Slot[]> = {};

  for (const p of plan) {
    const parent = await prisma.project.create({
      data: {
        name: p.name, code: p.code, description: p.description, color: p.color, status: p.status ?? "ACTIVE", health: p.health ?? "ON_TRACK",
        startDate: d(p.start), endDate: d(p.end), estimatedHours: p.est, clientId: clients[p.client].id, managerId: users[p.manager].id,
      },
    });
    for (const [name, due, done] of p.milestones) await prisma.milestone.create({ data: { name, dueDate: d(due), done, projectId: parent.id } });
    for (const sp of p.subs) {
      const sub = await prisma.project.create({
        data: { name: sp.name, color: p.color, startDate: d(sp.start), endDate: d(sp.end), estimatedHours: sp.est, clientId: clients[p.client].id, parentId: parent.id, managerId: users[p.manager].id, status: p.status ?? "ACTIVE" },
      });
      const taskIds: number[] = [];
      for (const [i, title] of sp.tasks.entries()) {
        const dueOffset = (d(sp.end).getTime() - d(sp.start).getTime()) * ((i + 1) / (sp.tasks.length + 1));
        const due = new Date(d(sp.start).getTime() + dueOffset);
        const status = due < new Date("2026-09-20") ? "DONE" : due < new Date("2026-10-31") ? "IN_PROGRESS" : "TODO";
        const t = await prisma.task.create({ data: { title, projectId: sub.id, assigneeId: users[sp.team[i % sp.team.length]].id, status, estimatedHours: 20 + Math.round(rand() * 60), dueDate: due } });
        taskIds.push(t.id);
      }
      for (const key of sp.team) {
        await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: parent.id, userId: users[key].id } }, create: { projectId: parent.id, userId: users[key].id }, update: {} });
        (slots[key] ??= []).push({ projectId: sub.id, taskIds, work: sp.work, start: d(sp.start), end: d(sp.end), billable: p.client !== "Bridge UX (Internal)" });
      }
    }
  }
  for (const u of Object.values(users)) await prisma.projectMember.create({ data: { projectId: ops.id, userId: u.id } });

  // About four months of weekday time entries up to yesterday.
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 1));
  const entries: Prisma.TimeEntryCreateManyInput[] = [];
  for (const [key, u] of Object.entries(users)) {
    for (let day = new Date(start); fmt(day) < fmt(today); day.setUTCDate(day.getUTCDate() + 1)) {
      const wd = day.getUTCDay();
      if (wd === 0 || wd === 6 || rand() < 0.05) continue;
      const active = (slots[key] ?? []).filter((sl) => sl.start <= day && sl.end >= day);
      let clock = 9 * 60 + 30;
      const target = 7 * 60 + Math.round(rand() * 90);
      // Morning standup on internal ops.
      const m = 30;
      entries.push({ userId: u.id, projectId: ops.id, date: fmt(day), startTime: hhmm(clock), endTime: hhmm(clock + m), minutes: m, description: pick(internalWork), billable: false });
      clock += m;
      while (clock < 9 * 60 + 30 + target) {
        const len = Math.min(30 * (2 + Math.floor(rand() * 5)), 9 * 60 + 30 + target - clock);
        if (len < 15) break;
        if (clock >= 13 * 60 && clock < 13 * 60 + 45) { clock = 13 * 60 + 45; continue; }
        const slot = active.length ? pick(active) : null;
        if (!slot || rand() < 0.08) {
          entries.push({ userId: u.id, projectId: ops.id, date: fmt(day), startTime: hhmm(clock), endTime: hhmm(clock + len), minutes: len, description: pick(internalWork), billable: false });
        } else {
          entries.push({
            userId: u.id, projectId: slot.projectId, taskId: rand() < 0.7 && slot.taskIds.length ? pick(slot.taskIds) : null, date: fmt(day),
            startTime: hhmm(clock), endTime: hhmm(clock + len), minutes: len, description: pick(slot.work), billable: slot.billable,
          });
        }
        clock += len;
      }
    }
  }
  await prisma.timeEntry.createMany({ data: entries });

  // Size estimates from the generated history so budgets look realistic: most work is on budget, a few run over.
  const subs = await prisma.project.findMany({ where: { parentId: { not: null } } });
  const parentEst = new Map<number, number>();
  for (const sp of subs) {
    const mins = entries.filter((e) => e.projectId === sp.id).reduce((a, e) => a + e.minutes, 0);
    const span = sp.endDate!.getTime() - sp.startDate!.getTime();
    const elapsed = Math.min(1, Math.max(0.05, (today.getTime() - sp.startDate!.getTime()) / span));
    const factor = sp.name === "Banking API" || sp.name === "Visual Identity" ? 0.9 : 1.05 + rand() * 0.3;
    const est = Math.max(40, Math.round(((mins / 60) / elapsed) * factor / 10) * 10);
    await prisma.project.update({ where: { id: sp.id }, data: { estimatedHours: est } });
    parentEst.set(sp.parentId!, (parentEst.get(sp.parentId!) ?? 0) + est);
  }
  for (const [id, est] of parentEst) await prisma.project.update({ where: { id }, data: { estimatedHours: est } });
  // Timesheet approvals: older weeks approved, last week submitted by most people (one sent back for changes).
  const monday = (dt: Date) => { const x = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const thisWeek = monday(today);
  const reviewer = (key: string) => (["priya", "rohan", "admin"].includes(key) ? users.admin.id : (["neha", "karan", "meera"].includes(key) ? users.priya.id : users.rohan.id));
  for (const [key, u] of Object.entries(users)) {
    for (let w = 1; w <= 6; w++) {
      const ws = new Date(thisWeek); ws.setUTCDate(ws.getUTCDate() - 7 * w);
      if (w === 1) {
        if (key === "arjun" || key === "admin") continue; // not submitted yet
        const rejected = key === "sneha";
        await prisma.timesheetPeriod.create({ data: { userId: u.id, weekStart: fmt(ws), status: rejected ? "REJECTED" : "SUBMITTED", submittedAt: new Date(ws.getTime() + 5 * 864e5), ...(rejected ? { note: "Please split the Frontend Build hours by task before resubmitting.", reviewedById: reviewer(key), reviewedAt: new Date(ws.getTime() + 7 * 864e5) } : {}) } });
      } else {
        await prisma.timesheetPeriod.create({ data: { userId: u.id, weekStart: fmt(ws), status: "APPROVED", submittedAt: new Date(ws.getTime() + 5 * 864e5), reviewedById: reviewer(key), reviewedAt: new Date(ws.getTime() + 8 * 864e5) } });
      }
    }
  }

  // Invitations in different states.
  const inv = (email: string, name: string, role: string, team: string, days: number, status = "PENDING") =>
    prisma.invitation.create({ data: { email, name, role, teamId: teams[team].id, token: `demo-${email.split("@")[0]}`, status, expiresAt: new Date(Date.now() + days * 864e5), invitedById: users.admin.id, projectIds: "[]", allProjects: role !== "EMPLOYEE" } });
  await inv("rahul@example.com", "Rahul Verma", "EMPLOYEE", "Engineering", 6);
  await inv("isha@example.com", "Isha Menon", "MANAGER", "Design", 3);
  await inv("dev@example.com", "Dev Malhotra", "EMPLOYEE", "QA", -2);

  console.log(`Seeded ${Object.keys(users).length} users, ${plan.length + 1} projects and ${entries.length} time entries.`);
  console.log("Sign in with admin@example.com, priya@example.com (manager) or neha@example.com (employee). Password: password123");
}

main().finally(() => prisma.$disconnect());
