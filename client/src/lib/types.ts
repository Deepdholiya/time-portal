// Shapes returned by the API. Only fields the UI relies on are typed; extra fields pass through.
export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
export type Level = string;
export type Permissions = Record<string, Level>;
export interface CompanySettings {
  overloadPct: number; healthyPct: number; underPct: number; tempPasswordHours: number; sessionTimeoutMinutes: number;
  enforceAdminMfa: boolean; aiEnabled: boolean; allowOverlappingTimers: boolean; lockApprovedWeeks: boolean; invitationDays: number; taskKey: string;
}
export interface Company {
  id: number; name: string; slug: string; color: string; logoUrl?: string | null; country?: string | null; timezone: string; currency: string;
  workWeek: string; weekStartsOn: number; hoursPerDay: number; billingNotes?: string | null; settings: CompanySettings; status: string;
}
export interface Me {
  user: { id: number; name: string; email: string; role: Role; title?: string | null; phone?: string | null; weeklyCapacity: number; mfaEnabled: boolean; mustChangePassword: boolean; status: string; team?: { id: number; name: string; color: string } | null };
  permissions: Permissions;
  company: Company;
  companies: { id: number; name: string; color: string; slug: string }[];
  mfaSetupRequired: boolean;
}
export interface UserLite { id: number; name: string; email?: string; title?: string | null; role?: Role; team?: { id: number; name: string; color?: string } | null }
export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
export interface Task {
  id: number; key: string; number: number; title: string; description?: string | null; status: TaskStatus; priority: Priority; section?: string | null; sortOrder: number;
  startDate?: string | null; dueDate?: string | null; estimateHours?: number | null; billable: boolean; recurrence?: string | null; tags: string[]; customFields: Record<string, unknown>;
  completedAt?: string | null; projectId: number; parentId?: number | null; milestoneId?: number | null; assigneeId?: number | null; creatorId?: number | null;
  project?: { id: number; name: string; color: string; parentId?: number | null; parent?: { id: number; name: string; color: string } | null };
  assignee?: UserLite | null; milestone?: { id: number; name: string; date: string } | null;
  trackedMinutes: number; subtaskCount: number; subtaskDone: number; progress: number; commentCount?: number; attachmentCount?: number;
  blockedBy: { id: number; key: string; title: string; status: TaskStatus; dueDate?: string | null }[]; isBlocked: boolean; conflict: boolean; overdue: boolean;
  [k: string]: unknown;
}
export interface Option { id: number; name: string; color?: string }
export interface ProjectOption {
  id: number; name: string; code?: string | null; color: string; parentId?: number | null; clientId?: number | null; status: string; billingType: string; tags: string[];
  canLog: boolean; tasks: { id: number; key?: string; title: string; status: TaskStatus; assigneeId?: number | null; billable?: boolean }[]; milestones: { id: number; name: string; date: string }[];
  [k: string]: unknown;
}
export interface Options {
  projects: ProjectOption[]; users: UserLite[]; teams: Option[]; clients: Option[]; initiatives: Option[]; templates: { id: number; kind: string; name: string }[];
  tags: string[]; customFields: { id: number; name: string; type: string; options: string[] }[]; taskKey: string;
}
export interface TimeEntry {
  id: number; date: string; startTime?: string | null; endTime?: string | null; minutes: number; description: string; billable: boolean; running: boolean;
  startedAt?: string | null; pausedAt?: string | null; accumulatedSec: number; elapsedSec?: number; userId: number; projectId: number; taskId?: number | null;
  user?: UserLite; project?: { id: number; name: string; color: string; parentId?: number | null; parent?: { id: number; name: string; color: string } | null; client?: { id: number; name: string } | null };
  task?: { id: number; title: string; number?: number; key?: string } | null;
  [k: string]: unknown;
}
export interface Notification { id: number; type: string; title: string; body?: string | null; link?: string | null; readAt?: string | null; createdAt: string }
