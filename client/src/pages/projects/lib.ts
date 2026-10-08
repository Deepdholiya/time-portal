// Project shapes returned by /api/projects (financial fields are omitted for people without financials access).
export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED";
export type BillingType = "HOURLY" | "FIXED" | "NON_BILLABLE";
export type Health = "ON_TRACK" | "AT_RISK" | "DELAYED";

export interface Links { figma?: string; document?: string; drive?: string; other?: { label: string; url: string }[] }
export interface MilestoneRow { id: number; projectId: number; name: string; description: string | null; date: string; done: boolean }
export interface ChildProject { id: number; name: string; color: string; status: ProjectStatus; startDate: string | null; endDate: string | null; estimatedHours: number | null; archived: boolean }
export interface ProjectStats {
  trackedMinutes: number; billableMinutes: number; revenue?: number; cost?: number;
  tasks: { total: number; done: number; overdue: number; blocked: number; conflicts: number; estimateHours: number };
  progress: number; missedMilestones: number; nextMilestone: { id: number; name: string; date: string } | null;
  health: Health; reasons: string[]; budgetConsumed?: number | null; budgetRemaining?: number | null; hourVariance: number | null;
}
export interface Project {
  id: number; name: string; code: string | null; description: string | null; color: string; status: ProjectStatus; priority: string; archived: boolean;
  startDate: string | null; endDate: string | null; estimatedHours: number | null; billingType: BillingType; budget?: number | null; hourlyRate?: number | null;
  tags: string[]; links: Links;
  client: { id: number; name: string; email: string | null; contactName: string | null; phone: string | null } | null;
  manager: { id: number; name: string } | null; team: { id: number; name: string } | null; initiative: { id: number; name: string; color: string } | null;
  members: { id: number; name: string }[]; children: ChildProject[]; milestones: MilestoneRow[];
  hasShareLink: boolean; access: "member" | "none"; stats?: ProjectStats;
}
export interface ProjectDetail extends Project { notes: string | null; parent: { id: number; name: string; color: string } | null; parentId: number | null; clientShareToken?: string | null }

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: "gray" | "blue" | "yellow" | "green" }> = {
  PLANNING: { label: "Planning", tone: "gray" }, ACTIVE: { label: "Active", tone: "blue" }, ON_HOLD: { label: "On hold", tone: "yellow" }, COMPLETED: { label: "Completed", tone: "green" },
};
export const PROJECT_STATUSES = Object.keys(PROJECT_STATUS) as ProjectStatus[];
export const BILLING: Record<BillingType, string> = { HOURLY: "Hourly", FIXED: "Fixed fee", NON_BILLABLE: "Non-billable" };
export const BILLING_TYPES = Object.keys(BILLING) as BillingType[];

/** Full PUT body for a project (the API replaces every field, so always start from the current values). */
export function projectBody(p: Project) {
  return {
    name: p.name, code: p.code, description: p.description, color: p.color, status: p.status, priority: p.priority,
    startDate: p.startDate, endDate: p.endDate, estimatedHours: p.estimatedHours, billingType: p.billingType,
    ...(p.budget !== undefined ? { budget: p.budget } : {}), ...(p.hourlyRate !== undefined ? { hourlyRate: p.hourlyRate } : {}),
    tags: p.tags, links: cleanLinks(p.links), clientId: p.client?.id ?? null, managerId: p.manager?.id ?? null, teamId: p.team?.id ?? null,
    initiativeId: p.initiative?.id ?? null, memberIds: p.members.map((m) => m.id),
  };
}

export function cleanLinks(l: Links): Links {
  const out: Links = {};
  if (l.figma?.trim()) out.figma = l.figma.trim();
  if (l.document?.trim()) out.document = l.document.trim();
  if (l.drive?.trim()) out.drive = l.drive.trim();
  const other = (l.other ?? []).filter((o) => o.url.trim()).map((o) => ({ label: o.label.trim() || o.url.trim(), url: o.url.trim() }));
  if (other.length) out.other = other;
  return out;
}

export const trackedHours = (p: Project) => (p.stats?.trackedMinutes ?? 0) / 60;
