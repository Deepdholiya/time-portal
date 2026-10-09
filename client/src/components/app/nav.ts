import {
  Inbox, CircleUserRound, Clock, CalendarDays, Sheet as SheetIcon, ListTodo, FolderKanban, Map, Building2, Users, UsersRound, BarChart3,
  FileSpreadsheet, Gauge, ClipboardCheck, Clock3, Plane, UserCog, ShieldCheck, Building, Settings, Plug, Workflow, ScrollText, Mail, Home, Tags,
  LayoutDashboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem { to: string; label: string; icon: LucideIcon; perm?: [string, string?]; anyPerm?: [string, string?][]; badge?: "inbox" | "approvals"; keywords?: string }
export interface NavGroup { title?: string; items: NavItem[] }
/** One icon in the rail and the panel it opens. */
export interface NavSection { id: string; label: string; icon: LucideIcon; groups: NavGroup[]; bottom?: boolean }

/**
 * Role-based navigation, grouped the way Intercom groups its inbox: a narrow rail of areas, and a panel listing each area's pages.
 * Items without permission are hidden, and the server still enforces access.
 */
export const NAV: NavSection[] = [
  {
    id: "home", label: "Home", icon: Home,
    groups: [{ items: [
      { to: "/", label: "Overview", icon: LayoutDashboard, keywords: "home dashboard" },
      { to: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox", keywords: "notifications" },
      { to: "/my-tasks", label: "My tasks", icon: CircleUserRound, keywords: "assigned issues" },
    ] }],
  },
  {
    id: "time", label: "Time", icon: Clock,
    groups: [
      { items: [
        { to: "/time", label: "Time tracker", icon: Clock, keywords: "log entries manual" },
        { to: "/timesheet", label: "Timesheet", icon: SheetIcon, keywords: "grid hours submit" },
        { to: "/calendar", label: "Calendar", icon: CalendarDays, keywords: "schedule month" },
        { to: "/leave", label: "Leave", icon: Plane, keywords: "vacation holiday time off" },
      ] },
      { title: "Team", items: [
        { to: "/approvals", label: "Approvals", icon: ClipboardCheck, anyPerm: [["approveTimesheets", "yes"], ["leaveApprove", "yes"]], badge: "approvals" },
        { to: "/team-time", label: "Team timesheets", icon: Clock3, perm: ["timesheetsView", "all"], keywords: "combined employee project time" },
      ] },
    ],
  },
  {
    id: "work", label: "Work", icon: FolderKanban,
    groups: [
      { items: [
        { to: "/tasks", label: "Tasks", icon: ListTodo, keywords: "issues kanban board list" },
        { to: "/projects", label: "Projects", icon: FolderKanban },
        { to: "/roadmap", label: "Roadmap", icon: Map, perm: ["roadmap", "view"], keywords: "gantt timeline plan" },
      ] },
      { title: "Directory", items: [
        { to: "/clients", label: "Clients", icon: Building2 },
        { to: "/people", label: "Employees", icon: Users, keywords: "directory people" },
        { to: "/teams", label: "Teams", icon: UsersRound },
      ] },
    ],
  },
  {
    id: "insights", label: "Insights", icon: BarChart3,
    groups: [{ items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3, perm: ["analytics", "own"] },
      { to: "/reports", label: "Reports", icon: FileSpreadsheet, perm: ["export", "own"], keywords: "excel csv pdf export" },
      { to: "/workload", label: "Workload", icon: Gauge, perm: ["analytics", "all"], keywords: "capacity utilization" },
    ] }],
  },
  {
    id: "admin", label: "Admin", icon: Settings, bottom: true,
    groups: [
      { title: "People & access", items: [
        { to: "/admin/users", label: "Users & invites", icon: UserCog, perm: ["people", "invite"] },
        { to: "/admin/roles", label: "Roles & permissions", icon: ShieldCheck, perm: ["settings", "yes"] },
        { to: "/admin/companies", label: "Companies", icon: Building, perm: ["companies", "yes"] },
      ] },
      { title: "Configuration", items: [
        { to: "/admin/settings", label: "Company settings", icon: Settings, perm: ["settings", "yes"], keywords: "cutoff submission rules" },
        { to: "/admin/tags", label: "Time tags", icon: Tags, perm: ["settings", "yes"], keywords: "labels categories" },
        { to: "/admin/integrations", label: "Integrations", icon: Plug, perm: ["settings", "yes"], keywords: "sso slack google microsoft" },
        { to: "/admin/automations", label: "Automations", icon: Workflow, perm: ["settings", "yes"] },
      ] },
      { title: "Logs", items: [
        { to: "/admin/audit", label: "Audit log", icon: ScrollText, perm: ["audit", "yes"] },
        { to: "/admin/outbox", label: "Email log", icon: Mail, perm: ["settings", "yes"] },
      ] },
    ],
  },
];

type Can = (f: string, l?: string) => boolean;
const allowed = (can: Can) => (i: NavItem) => (!i.perm || can(i.perm[0], i.perm[1])) && (!i.anyPerm || i.anyPerm.some(([f, l]) => can(f, l)));

export function visibleNav(can: Can): NavSection[] {
  return NAV.map((s) => ({ ...s, groups: s.groups.map((g) => ({ ...g, items: g.items.filter(allowed(can)) })).filter((g) => g.items.length) })).filter((s) => s.groups.length);
}

/** Every page the person can open, for search. */
export const navItems = (can: Can) => visibleNav(can).flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => ({ ...i, section: s.label }))));

/** The area a path belongs to (the longest matching item wins, so /time and /timesheet stay apart). */
export function sectionFor(sections: NavSection[], path: string) {
  let best: { id: string; len: number } | null = null;
  for (const s of sections) for (const g of s.groups) for (const i of g.items) {
    const hit = i.to === "/" ? path === "/" : path === i.to || path.startsWith(i.to + "/");
    if (hit && (!best || i.to.length > best.len)) best = { id: s.id, len: i.to.length };
  }
  if (!best && path.startsWith("/settings")) return "home";
  return best?.id ?? "home";
}
