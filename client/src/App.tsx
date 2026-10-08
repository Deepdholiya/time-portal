import { Fragment, useEffect, useState, type FormEvent } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { useApp } from "./state";
import { TimerBar } from "./components/TimerBar";
import { Icon } from "./components/Icons";
import { Modal } from "./components/Modal";
import { Login } from "./pages/Login";
import { AcceptInvite } from "./pages/AcceptInvite";
import { Dashboard } from "./pages/Dashboard";
import { TimePage } from "./pages/TimePage";
import { Timesheet } from "./pages/Timesheet";
import { Projects } from "./pages/Projects";
import { Roadmap } from "./pages/Roadmap";
import { Analytics } from "./pages/Analytics";
import { Approvals } from "./pages/Approvals";
import { People } from "./pages/People";
import { Settings } from "./pages/Settings";

export const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };
export const initials = (name: string) => name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

export function App() {
  const { me, perms, loading, timeVersion } = useApp();
  const loc = useLocation();
  const [profile, setProfile] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (perms?.approveTimesheets === "yes") api<unknown[]>("/timesheets/approvals").then((r) => setPending(r.length)).catch(() => {});
  }, [perms?.approveTimesheets, timeVersion, loc.pathname]);

  if (loc.pathname.startsWith("/invite/")) return <AcceptInvite token={loc.pathname.split("/")[2]} />;
  if (loading) return <div className="center muted">Loading…</div>;
  if (!me || !perms) return <Login />;

  const sections = [
    { title: "Track", items: [
      { to: "/", label: "Dashboard", icon: "dashboard", show: true },
      { to: "/time", label: "Time tracker", icon: "clock", show: true },
      { to: "/timesheet", label: "Timesheet", icon: "grid", show: true },
    ] },
    { title: "Analyze", items: [
      { to: "/analytics", label: "Analytics", icon: "chart", show: perms.analytics !== "none" },
      { to: "/roadmap", label: "Roadmap", icon: "roadmap", show: perms.roadmap === "view" },
      { to: "/approvals", label: "Approvals", icon: "check", show: perms.approveTimesheets === "yes", count: pending },
    ] },
    { title: "Manage", items: [
      { to: "/projects", label: "Projects", icon: "folder", show: true },
      { to: "/people", label: "People", icon: "users", show: perms.managePeople === "yes" },
    ] },
    { title: "Admin", items: [{ to: "/settings", label: "Access & audit", icon: "shield", show: perms.managePeople === "yes" }] },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo">B</span><div><strong>Bridge UX</strong><small>Time Portal</small></div></div>
        <nav aria-label="Main">
          {sections.map((s) => {
            const items = s.items.filter((i) => i.show);
            if (!items.length) return null;
            return (
              <div key={s.title}>
                <div className="nav-section">{s.title}</div>
                {items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                    <span className="nav-icon"><Icon name={n.icon} /></span>{n.label}
                    {"count" in n && !!n.count && <span className="count">{n.count}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <button className="me" onClick={() => setProfile(true)} title="Profile and settings">
          <span className="avatar">{initials(me.name)}</span>
          <span className="grow"><strong>{me.name}</strong><small>{ROLE_LABEL[me.role] ?? me.role}{me.team ? ` · ${me.team.name}` : ""}</small></span>
        </button>
      </aside>
      <main>
        <TimerBar />
        <div className="page">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/time" element={<TimePage />} />
            <Route path="/timesheet" element={<Timesheet />} />
            <Route path="/projects" element={<Projects />} />
            {perms.roadmap === "view" && <Route path="/roadmap" element={<Roadmap />} />}
            {perms.analytics !== "none" && <Route path="/analytics" element={<Analytics />} />}
            {perms.approveTimesheets === "yes" && <Route path="/approvals" element={<Approvals />} />}
            {perms.managePeople === "yes" && <Route path="/people" element={<People />} />}
            {perms.managePeople === "yes" && <Route path="/settings" element={<Settings />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      {profile && <Profile onClose={() => setProfile(false)} />}
    </div>
  );
}

function Profile({ onClose }: { onClose: () => void }) {
  const { me, perms, logout, toast } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  async function change(e: FormEvent) {
    e.preventDefault(); setError("");
    try { await api("/auth/change-password", { body: { current, next } }); toast("Password changed"); setCurrent(""); setNext(""); }
    catch (err) { setError((err as Error).message); }
  }
  const LEVEL: Record<string, string> = { none: "No access", own: "Own data", all: "Everyone", view: "Can view", no: "No", yes: "Yes" };
  const LABEL: Record<string, string> = { analytics: "Analytics", roadmap: "Roadmap", export: "Export reports", manageProjects: "Manage projects", editOthersTime: "Edit others' time", approveTimesheets: "Approve timesheets", managePeople: "Manage people" };
  return (
    <Modal title="Your profile" onClose={onClose}>
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(me!.name)}</span>
        <div className="grow"><strong>{me!.name}</strong><div className="muted small">{me!.email}</div><div className="muted small">{ROLE_LABEL[me!.role]}{me!.team ? ` · ${me!.team.name}` : ""}</div></div>
      </div>
      <h4>Your access</h4>
      <dl className="props">{Object.entries(perms!).map(([k, v]) => <Fragment key={k}><dt>{LABEL[k] ?? k}</dt><dd>{LEVEL[v] ?? v}</dd></Fragment>)}</dl>
      <h4>Change password</h4>
      <form onSubmit={change} className="stack">
        <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <div className="row between">
          <button type="button" className="btn ghost" onClick={logout}><Icon name="logout" /> Sign out</button>
          <button className="btn primary">Update password</button>
        </div>
      </form>
    </Modal>
  );
}
