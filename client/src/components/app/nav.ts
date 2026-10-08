import {
  Inbox, CircleUserRound, Timer, CalendarDays, Sheet as SheetIcon, ListTodo, FolderKanban, Map, Building2, Users, UsersRound, BarChart3,
  FileSpreadsheet, Gauge, ClipboardCheck, Clock3, Plane, UserCog, ShieldCheck, Building, Settings, Plug, Workflow, ScrollText, Mail, Home,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem { to: string; label: string; icon: LucideIcon; perm?: [string, string?]; anyPerm?: [string, string?][]; badge?: "inbox" | "approvals"; keywords?: string }
export interface NavSection { title?: string; items: NavItem[] }

/** Role-based navigation (requirements section 14). Items without permission are hidden, and the server still enforces access. */
export const NAV: NavSection[] = [
  {
    items: [
      { to: "/", label: "Home", icon: Home, keywords: "dashboard overview" },
      { to: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox", keywords: "notifications" },
      { to: "/my-tasks", label: "My tasks", icon: CircleUserRound, keywords: "assigned issues" },
    ],
  },
  {
    title: "Time",
    items: [
      { to: "/time", label: "Time tracker", icon: Timer, keywords: "timer start stop log" },
      { to: "/timesheet", label: "Timesheet", icon: SheetIcon, keywords: "week hours submit" },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, keywords: "schedule month" },
      { to: "/leave", label: "Leave", icon: Plane, keywords: "vacation holiday time off" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { to: "/tasks", label: "Tasks", icon: ListTodo, keywords: "issues kanban board list" },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/roadmap", label: "Roadmap", icon: Map, perm: ["roadmap", "view"], keywords: "gantt timeline plan" },
      { to: "/clients", label: "Clients", icon: Building2 },
      { to: "/people", label: "Employees", icon: Users, keywords: "directory people" },
      { to: "/teams", label: "Teams", icon: UsersRound },
    ],
  },
  {
    title: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3, perm: ["analytics", "own"] },
      { to: "/reports", label: "Reports", icon: FileSpreadsheet, perm: ["export", "own"], keywords: "excel csv pdf export" },
      { to: "/workload", label: "Workload", icon: Gauge, perm: ["analytics", "all"], keywords: "capacity utilization" },
      { to: "/team-time", label: "Team timesheets", icon: Clock3, perm: ["timesheetsView", "all"], keywords: "combined employee project time" },
      { to: "/approvals", label: "Approvals", icon: ClipboardCheck, anyPerm: [["approveTimesheets", "yes"], ["leaveApprove", "yes"]], badge: "approvals" },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/admin/users", label: "Users & invites", icon: UserCog, perm: ["people", "invite"] },
      { to: "/admin/roles", label: "Roles & permissions", icon: ShieldCheck, perm: ["settings", "yes"] },
      { to: "/admin/companies", label: "Companies", icon: Building, perm: ["companies", "yes"] },
      { to: "/admin/settings", label: "Company settings", icon: Settings, perm: ["settings", "yes"] },
      { to: "/admin/integrations", label: "Integrations", icon: Plug, perm: ["settings", "yes"], keywords: "sso slack google microsoft" },
      { to: "/admin/automations", label: "Automations", icon: Workflow, perm: ["settings", "yes"] },
      { to: "/admin/audit", label: "Audit log", icon: ScrollText, perm: ["audit", "yes"] },
      { to: "/admin/outbox", label: "Email log", icon: Mail, perm: ["settings", "yes"] },
    ],
  },
];

export function visibleNav(can: (f: string, l?: string) => boolean) {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => (!i.perm || can(i.perm[0], i.perm[1])) && (!i.anyPerm || i.anyPerm.some(([f, l]) => can(f, l)))) })).filter((s) => s.items.length);
}
