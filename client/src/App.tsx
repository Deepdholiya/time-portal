import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loading } from "./components/ui";
import { AppLayout } from "./components/app/app-layout";
import { Guard } from "./components/app/page";
import { useSession } from "./lib/session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = <P extends Record<string, any> = object>(f: () => Promise<{ default: React.ComponentType<P> }>) => lazy(f);
// Auth & public
const Login = p(() => import("./pages/auth/login"));
const Mfa = p(() => import("./pages/auth/mfa"));
const SetPassword = p(() => import("./pages/auth/set-password"));
const Forgot = p(() => import("./pages/auth/forgot"));
const Reset = p(() => import("./pages/auth/reset"));
const ClientStatus = p(() => import("./pages/client-status"));
// Time
const Home = p(() => import("./pages/home/home"));
const TimeTracker = p(() => import("./pages/time/time-tracker"));
const Timesheet = p(() => import("./pages/timesheet/timesheet"));
const CalendarPage = p(() => import("./pages/calendar/calendar"));
const Leave = p(() => import("./pages/leave/leave"));
// Work
const MyTasks = p(() => import("./pages/my-tasks/my-tasks"));
const Tasks = p(() => import("./pages/tasks/tasks"));
const Projects = p(() => import("./pages/projects/projects"));
const Project = p(() => import("./pages/projects/project"));
// Insights
const Inbox = p(() => import("./pages/inbox/inbox"));
const Roadmap = p(() => import("./pages/roadmap/roadmap"));
const Workload = p(() => import("./pages/workload/workload"));
const Analytics = p(() => import("./pages/analytics/analytics"));
const Reports = p(() => import("./pages/reports/reports"));
const Approvals = p(() => import("./pages/approvals/approvals"));
const TeamTime = p(() => import("./pages/team-time/team-time"));
// People & admin
const People = p(() => import("./pages/people/people"));
const Person = p(() => import("./pages/people/person"));
const Teams = p(() => import("./pages/teams/teams"));
const Clients = p(() => import("./pages/clients/clients"));
const Users = p(() => import("./pages/admin/users"));
const Roles = p(() => import("./pages/admin/roles"));
const Companies = p(() => import("./pages/admin/companies"));
const Settings = p(() => import("./pages/admin/settings"));
const TagsAdmin = p(() => import("./pages/admin/tags"));
const Integrations = p(() => import("./pages/admin/integrations"));
const Automations = p(() => import("./pages/admin/automations"));
const Audit = p(() => import("./pages/admin/audit"));
const Outbox = p(() => import("./pages/admin/outbox"));
const Account = p<{ mfaSetupRequired?: boolean }>(() => import("./pages/account/account"));

const g = (perm: [string, string?], el: ReactNode) => <Guard perm={perm}>{el}</Guard>;

export function App() {
  const { status, me } = useSession();
  const loc = useLocation();
  if (status === "loading") return <Loading label="Loading Time Portal…" />;

  const publicRoutes = (
    <>
      <Route path="/client/:token" element={<ClientStatus />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset/:token" element={<Reset />} />
    </>
  );

  if (status === "anon" || status === "mfa") {
    const next = loc.pathname.startsWith("/login") || loc.pathname.startsWith("/mfa") ? "" : `?next=${encodeURIComponent(loc.pathname + loc.search)}`;
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          {publicRoutes}
          <Route path="/login" element={<Login />} />
          <Route path="/mfa" element={status === "mfa" ? <Mfa /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to={status === "mfa" ? "/mfa" : `/login${next}`} replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Signed in but must replace a temporary password, or an admin must enrol in MFA first.
  if (me?.user.mustChangePassword) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          {publicRoutes}
          <Route path="*" element={<SetPassword />} />
        </Routes>
      </Suspense>
    );
  }
  if (me?.mfaSetupRequired) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="*" element={<Account mfaSetupRequired />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Routes>
      {publicRoutes}
      <Route path="/login" element={<Navigate to={new URLSearchParams(loc.search).get("next") || "/"} replace />} />
      <Route path="/mfa" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="my-tasks" element={<MyTasks />} />
        <Route path="time" element={<TimeTracker />} />
        <Route path="timesheet" element={<Timesheet />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="leave" element={<Leave />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:id" element={<Tasks />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<Project />} />
        <Route path="roadmap" element={g(["roadmap", "view"], <Roadmap />)} />
        <Route path="clients" element={<Clients />} />
        <Route path="people" element={<People />} />
        <Route path="people/:id" element={<Person />} />
        <Route path="teams" element={<Teams />} />
        <Route path="analytics" element={g(["analytics", "own"], <Analytics />)} />
        <Route path="reports" element={g(["export", "own"], <Reports />)} />
        <Route path="workload" element={g(["analytics", "all"], <Workload />)} />
        <Route path="team-time" element={g(["timesheetsView", "all"], <TeamTime />)} />
        <Route path="approvals" element={<Guard any={[["approveTimesheets", "yes"], ["leaveApprove", "yes"]]}><Approvals /></Guard>} />
        <Route path="admin/users" element={g(["people", "invite"], <Users />)} />
        <Route path="admin/roles" element={g(["settings", "yes"], <Roles />)} />
        <Route path="admin/companies" element={g(["companies", "yes"], <Companies />)} />
        <Route path="admin/settings" element={g(["settings", "yes"], <Settings />)} />
        <Route path="admin/tags" element={g(["settings", "yes"], <TagsAdmin />)} />
        <Route path="admin/integrations" element={g(["settings", "yes"], <Integrations />)} />
        <Route path="admin/automations" element={g(["settings", "yes"], <Automations />)} />
        <Route path="admin/audit" element={g(["audit", "yes"], <Audit />)} />
        <Route path="admin/outbox" element={g(["settings", "yes"], <Outbox />)} />
        <Route path="settings/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
