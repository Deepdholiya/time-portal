import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Moon, Sun, Settings, Plus, UserRound, SquarePen, Clock } from "lucide-react";
import { Avatar, IconButton, Menu, Tooltip } from "@/components/ui";
import { get } from "@/lib/api";
import { useLocal } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { toggleTheme } from "@/lib/theme";
import { sectionFor, visibleNav, type NavSection } from "./nav";
import { useShell } from "./shell-context";
import s from "./sidebar.module.css";

function useCounts() {
  const { can } = useSession();
  const [counts, setCounts] = useState({ inbox: 0, approvals: 0 });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [n, ts, lv] = await Promise.all([
        get<{ unread: number }>("/notifications/count").catch(() => ({ unread: 0 })),
        can("approveTimesheets", "yes") ? get<unknown[]>("/timesheets/approvals").catch(() => []) : Promise.resolve([]),
        can("leaveApprove", "yes") ? get<unknown[]>("/leave/approvals").catch(() => []) : Promise.resolve([]),
      ]);
      if (alive) setCounts({ inbox: n.unread, approvals: ts.length + lv.length });
    };
    load();
    const i = setInterval(load, 45_000);
    window.addEventListener("tp:counts", load);
    return () => { alive = false; clearInterval(i); window.removeEventListener("tp:counts", load); };
  }, [can]);
  return counts;
}
/** Ask the sidebar to refresh the inbox and approval counters. */
export const refreshCounts = () => window.dispatchEvent(new Event("tp:counts"));

/**
 * Two-level navigation in the style of Intercom: a narrow rail of areas (Home, Time, Work, Insights, Admin) and a panel with the
 * chosen area's pages, grouped, with counts. Picking an area opens its first page.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, can, logout, switchCompany } = useSession();
  const shell = useShell();
  const nav = useNavigate();
  const loc = useLocation();
  const counts = useCounts();
  const sections = visibleNav(can);
  const current = sectionFor(sections, loc.pathname);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [loc.pathname]);
  const active = sections.find((x) => x.id === (picked ?? current)) ?? sections[0];
  if (!me) return null;
  const c = me.company;
  const dark = document.documentElement.dataset.theme === "dark";
  const badge = (sec: NavSection) => sec.groups.reduce((a, g) => a + g.items.reduce((b, i) => b + (i.badge ? counts[i.badge] : 0), 0), 0);

  const railButton = (sec: NavSection) => {
    const n = badge(sec);
    const on = sec.id === active.id;
    return (
      <Tooltip key={sec.id} content={sec.label} side="right">
        <button
          type="button"
          className={`${s.railItem} ${on ? s.railActive : ""}`}
          aria-current={sec.id === current ? "page" : undefined}
          aria-pressed={on}
          onClick={() => { setPicked(sec.id); if (sec.id !== current) { nav(sec.groups[0].items[0].to); onNavigate?.(); } }}
        >
          <span className={s.railIcon}><sec.icon size={18} strokeWidth={1.8} />{n > 0 && <span className={s.railDot} aria-label={`${n} waiting`} />}</span>
          <span className={s.railLabel}>{sec.label}</span>
        </button>
      </Tooltip>
    );
  };

  return (
    <aside className={s.sidebar} aria-label="Main navigation">
      <nav className={s.rail} aria-label="Areas">
        <Menu
          width={240}
          placement="right-start"
          trigger={<button className={s.workspace} aria-label={`${c.name}: workspace menu`}><span className={s.logo} style={{ background: c.color }}>{c.name[0]}</span></button>}
          items={[
            { type: "heading", label: c.name },
            ...me.companies.map((co) => ({
              label: co.name, checked: co.id === c.id,
              icon: <span className={s.logo} style={{ background: co.color, width: 16, height: 16, fontSize: 9 }}>{co.name[0]}</span>,
              onSelect: () => { if (co.id !== c.id) switchCompany(co.id).then(() => nav("/")); },
            })),
            can("companies", "yes") && { label: "Create company", icon: <Plus size={14} />, onSelect: () => nav("/admin/companies?new=1") },
            can("settings", "yes") && { type: "separator" as const },
            can("settings", "yes") && { label: "Company settings", icon: <Settings size={14} />, onSelect: () => nav("/admin/settings") },
          ]}
        />
        <div className={s.railGroup}>{sections.filter((x) => !x.bottom).map(railButton)}</div>
        <div className="grow" />
        <div className={s.railGroup}>
          {sections.filter((x) => x.bottom).map(railButton)}
          <Menu
            width={220}
            placement="right-start"
            trigger={<button className={s.railUser} aria-label="Your account"><Avatar name={me.user.name} size={28} /></button>}
            items={[
              { type: "heading", label: me.user.email },
              { label: "Account settings", icon: <UserRound size={14} />, onSelect: () => nav("/settings/account") },
              { label: dark ? "Light mode" : "Dark mode", icon: dark ? <Sun size={14} /> : <Moon size={14} />, onSelect: toggleTheme, shortcut: "⇧D" },
              { type: "separator" },
              { label: "Log out", icon: <LogOut size={14} />, onSelect: logout },
            ]}
          />
        </div>
      </nav>
      <div className={s.panel}>
        <div className={s.panelHead}>
          <h2>{active.label}</h2>
          <span className="grow" />
          {active.id === "time"
            ? <Tooltip content="Log time"><IconButton label="Log time" icon={<Clock size={15} />} onClick={() => shell.logTime()} /></Tooltip>
            : <Tooltip content="New task" shortcut="C"><IconButton label="New task" icon={<SquarePen size={15} />} onClick={() => shell.newTask()} /></Tooltip>}
        </div>
        <div className={s.scroll}>
          {active.groups.map((g, i) => <Group key={g.title ?? i} section={active.id} group={g} counts={counts} onNavigate={onNavigate} />)}
        </div>
        <div className={s.panelFoot}>
          <span className={s.logo} style={{ background: c.color, width: 16, height: 16, fontSize: 9 }}>{c.name[0]}</span>
          <span className="ellipsis small muted">{c.name}</span>
          <span className="grow" />
          <span className="tiny faint">{me.user.role === "ADMIN" ? "Admin" : me.user.role === "MANAGER" ? "Manager" : "Employee"}</span>
        </div>
      </div>
    </aside>
  );
}

function Group({ section, group, counts, onNavigate }: { section: string; group: NavSection["groups"][number]; counts: { inbox: number; approvals: number }; onNavigate?: () => void }) {
  const [collapsed, setCollapsed] = useLocal<Record<string, boolean>>("nav:collapsed", {});
  const key = `${section}:${group.title}`;
  const closed = !!group.title && !!collapsed[key];
  return (
    <div className={s.group}>
      {group.title && (
        <button type="button" className={s.groupTitle} aria-expanded={!closed} onClick={() => setCollapsed({ ...collapsed, [key]: !closed })}>
          <ChevronDown size={12} className={closed ? s.chevClosed : undefined} />
          {group.title}
        </button>
      )}
      {!closed && group.items.map((it) => {
        const n = it.badge ? counts[it.badge] : 0;
        return (
          <NavLink key={it.to} to={it.to} end={it.to === "/"} onClick={onNavigate} className={({ isActive }) => `${s.item} ${isActive ? s.active : ""}`}>
            <it.icon size={15} strokeWidth={1.8} />
            <span className="ellipsis">{it.label}</span>
            {n > 0 && <span className={`${s.count} ${it.badge === "inbox" ? s.accentCount : ""}`}>{n}</span>}
          </NavLink>
        );
      })}
    </div>
  );
}
