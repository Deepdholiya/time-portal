import { prisma } from "./db.js";

export const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

// Each feature has ordered levels: later levels include earlier ones.
export const FEATURES = {
  timesheetsView: { label: "View timesheets", group: "Time", levels: ["own", "all"], help: "See other people's time entries and descriptions" },
  editOthersTime: { label: "Edit others' time", group: "Time", levels: ["no", "yes"], help: "Add, edit and delete time for other people" },
  approveTimesheets: { label: "Approve timesheets", group: "Time", levels: ["no", "yes"], help: "Approve or send back weekly timesheets, unlock approved weeks" },
  leaveApprove: { label: "Approve leave", group: "Time", levels: ["no", "yes"], help: "Approve or reject leave requests" },
  analytics: { label: "Analytics", group: "Insights", levels: ["none", "own", "all"], help: "Dashboards, reports and drill-down" },
  financials: { label: "Financials", group: "Insights", levels: ["none", "view"], help: "Rates, revenue, cost, profit and budgets" },
  export: { label: "Export", group: "Insights", levels: ["none", "own", "all"], help: "Excel, CSV and PDF exports" },
  roadmap: { label: "Roadmap", group: "Planning", levels: ["none", "view", "edit"], help: "View or edit roadmaps, drag timeline bars" },
  projects: { label: "Projects", group: "Planning", levels: ["view", "manage"], help: "Create, edit, archive projects, clients, milestones" },
  tasks: { label: "Tasks", group: "Planning", levels: ["own", "create", "manage"], help: "own: update your tasks · create: add tasks and subtasks · manage: assign, reassign, dependencies, bulk edit" },
  directory: { label: "Employee directory", group: "People", levels: ["limited", "full"], help: "Limited hides confidential fields like phone and rates" },
  people: { label: "User management", group: "People", levels: ["none", "invite", "manage"], help: "Invite people, deactivate, reset passwords, revoke sessions" },
  aiAssist: { label: "AI assistant", group: "AI", levels: ["no", "yes"], help: "AI task summaries" },
  clientEmail: { label: "Client emails", group: "AI", levels: ["no", "yes"], help: "Draft and send client update emails" },
  audit: { label: "Audit logs", group: "Admin", levels: ["no", "yes"], help: "View and export the audit log" },
  settings: { label: "Company settings", group: "Admin", levels: ["no", "yes"], help: "Company settings, roles & permissions, integrations, automation" },
  companies: { label: "Companies", group: "Admin", levels: ["no", "yes"], help: "Create, switch and archive companies" },
} as const;
export type Feature = keyof typeof FEATURES;
export type Permissions = Record<Feature, string>;

const ALL_MAX = Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, f.levels[f.levels.length - 1]])) as Permissions;

export const DEFAULTS: Record<Role, Permissions> = {
  ADMIN: ALL_MAX,
  MANAGER: {
    timesheetsView: "all", editOthersTime: "yes", approveTimesheets: "yes", leaveApprove: "yes", analytics: "all", financials: "none",
    export: "all", roadmap: "edit", projects: "manage", tasks: "manage", directory: "full", people: "none", aiAssist: "yes",
    clientEmail: "yes", audit: "no", settings: "no", companies: "no",
  },
  EMPLOYEE: {
    timesheetsView: "own", editOthersTime: "no", approveTimesheets: "no", leaveApprove: "no", analytics: "own", financials: "none",
    export: "own", roadmap: "view", projects: "view", tasks: "create", directory: "limited", people: "none", aiAssist: "yes",
    clientEmail: "no", audit: "no", settings: "no", companies: "no",
  },
};

const valid = (feature: string, level: string) => {
  const f = FEATURES[feature as Feature];
  return !!f && (f.levels as readonly string[]).includes(level);
};

export async function rolePermissions(companyId: number, role: string): Promise<Permissions> {
  const base = { ...(DEFAULTS[role as Role] ?? DEFAULTS.EMPLOYEE) };
  // Admins always keep full access so nobody can lock the organization out.
  if (role === "ADMIN") return base;
  const rows = await prisma.rolePermission.findMany({ where: { companyId, role } });
  for (const r of rows) if (valid(r.feature, r.level)) base[r.feature as Feature] = r.level;
  return base;
}

export async function getPermissions(companyId: number, user: { id: number; role: string }): Promise<Permissions> {
  const base = await rolePermissions(companyId, user.role);
  if (user.role === "ADMIN") return base;
  const rows = await prisma.userPermission.findMany({ where: { companyId, userId: user.id } });
  for (const r of rows) if (valid(r.feature, r.level)) base[r.feature as Feature] = r.level;
  return base;
}

export const atLeast = (perms: Permissions, feature: Feature, level: string) => {
  const levels = FEATURES[feature].levels as readonly string[];
  return levels.indexOf(perms[feature]) >= levels.indexOf(level);
};

export async function getMatrix(companyId: number) {
  const out: Record<string, Permissions> = {};
  for (const role of ROLES) out[role] = await rolePermissions(companyId, role);
  return out;
}

// Project ids (including sub-projects) inside the company that the user can see and log time against.
export async function accessibleProjectIds(companyId: number, user: { id: number; role: string }, perms?: Permissions): Promise<number[] | "all"> {
  if (user.role === "ADMIN") return "all";
  if (perms && atLeast(perms, "projects", "manage")) return "all";
  const m = await prisma.membership.findUnique({ where: { companyId_userId: { companyId, userId: user.id } } });
  if (m?.allProjects) return "all";
  const memberships = await prisma.projectMember.findMany({ where: { userId: user.id, project: { companyId } }, select: { projectId: true } });
  const ids = new Set(memberships.map((x) => x.projectId));
  const managed = await prisma.project.findMany({ where: { companyId, managerId: user.id }, select: { id: true } });
  managed.forEach((p) => ids.add(p.id));
  // Membership on a parent project grants its sub-projects too.
  const children = await prisma.project.findMany({ where: { companyId, parentId: { in: [...ids] } }, select: { id: true } });
  children.forEach((c) => ids.add(c.id));
  return [...ids];
}

export const projectFilter = (ids: number[] | "all") => (ids === "all" ? {} : { id: { in: ids } });
