import { prisma } from "./db.js";

export const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const FEATURES = {
  analytics: { label: "Analytics", levels: ["none", "own", "all"] },
  roadmap: { label: "Roadmap", levels: ["none", "view"] },
  export: { label: "Export reports", levels: ["none", "own", "all"] },
  manageProjects: { label: "Manage projects", levels: ["no", "yes"] },
  editOthersTime: { label: "Edit others' time", levels: ["no", "yes"] },
  approveTimesheets: { label: "Approve timesheets", levels: ["no", "yes"] },
  managePeople: { label: "Manage people", levels: ["no", "yes"] },
} as const;
export type Feature = keyof typeof FEATURES;
export type Permissions = Record<Feature, string>;

export const DEFAULTS: Record<Role, Permissions> = {
  ADMIN: { analytics: "all", roadmap: "view", export: "all", manageProjects: "yes", editOthersTime: "yes", approveTimesheets: "yes", managePeople: "yes" },
  MANAGER: { analytics: "all", roadmap: "view", export: "all", manageProjects: "yes", editOthersTime: "yes", approveTimesheets: "yes", managePeople: "no" },
  EMPLOYEE: { analytics: "all", roadmap: "view", export: "own", manageProjects: "no", editOthersTime: "no", approveTimesheets: "no", managePeople: "no" },
};

// Admins always keep full access so nobody can lock the organization out.
export async function getPermissions(role: string): Promise<Permissions> {
  const base = { ...(DEFAULTS[role as Role] ?? DEFAULTS.EMPLOYEE) };
  if (role === "ADMIN") return base;
  const rows = await prisma.rolePermission.findMany({ where: { role } });
  for (const r of rows) {
    const f = FEATURES[r.feature as Feature];
    if (f && (f.levels as readonly string[]).includes(r.level)) base[r.feature as Feature] = r.level;
  }
  return base;
}

export async function getMatrix() {
  const out: Record<string, Permissions> = {};
  for (const role of ROLES) out[role] = await getPermissions(role);
  return out;
}

// Project ids (top-level and sub-projects) the user may log time against.
export async function accessibleProjectIds(user: { id: number; allProjects: boolean; role: string }): Promise<number[] | "all"> {
  if (user.allProjects || user.role === "ADMIN") return "all";
  const memberships = await prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } });
  const ids = new Set(memberships.map((m) => m.projectId));
  // Membership on a parent project grants its sub-projects too.
  const children = await prisma.project.findMany({ where: { parentId: { in: [...ids] } }, select: { id: true } });
  children.forEach((c) => ids.add(c.id));
  const managed = await prisma.project.findMany({ where: { managerId: user.id }, select: { id: true, children: { select: { id: true } } } });
  managed.forEach((p) => { ids.add(p.id); p.children.forEach((c) => ids.add(c.id)); });
  return [...ids];
}
