import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Search, SquarePen, ChevronDown, LogOut, Moon, Sun, Settings, Check, Plus, UserRound, Keyboard } from "lucide-react";
import { Avatar, IconButton, Kbd, Menu, Tooltip } from "@/components/arc";
import { get } from "@/lib/api";
import { useSession } from "@/lib/session";
import { toggleTheme } from "@/lib/theme";
import { visibleNav } from "./nav";
import { TimerWidget } from "./timer-widget";
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

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, can, logout, switchCompany } = useSession();
  const shell = useShell();
  const nav = useNavigate();
  const counts = useCounts();
  if (!me) return null;
  const c = me.company;
  return (
    <aside className={s.sidebar} aria-label="Main navigation">
      <div className={s.top}>
        <div className="row gap-4">
          <Menu
            width={240}
            trigger={
              <button className={s.workspace} aria-label="Workspace menu">
                <span className={s.logo} style={{ background: c.color }}>{c.name[0]}</span>
                <span className={s.wsName}>{c.name}</span>
                <ChevronDown size={13} className="faint" />
              </button>
            }
            items={[
              { type: "heading", label: me.user.email },
              ...me.companies.map((co) => ({
                label: co.name, checked: co.id === c.id,
                icon: <span className={s.logo} style={{ background: co.color, width: 16, height: 16, fontSize: 9 }}>{co.name[0]}</span>,
                onSelect: () => { if (co.id !== c.id) switchCompany(co.id).then(() => nav("/")); },
              })),
              can("companies", "yes") && { label: "Create company", icon: <Plus size={14} />, onSelect: () => nav("/admin/companies?new=1") },
              { type: "separator" },
              { label: "Account settings", icon: <UserRound size={14} />, onSelect: () => nav("/settings/account") },
              can("settings", "yes") && { label: "Company settings", icon: <Settings size={14} />, onSelect: () => nav("/admin/settings") },
              { label: "Toggle dark mode", icon: document.documentElement.dataset.theme === "dark" ? <Sun size={14} /> : <Moon size={14} />, onSelect: toggleTheme, shortcut: "⇧D" },
              { label: "Keyboard shortcuts", icon: <Keyboard size={14} />, onSelect: shell.openCommand },
              { type: "separator" },
              { label: "Log out", icon: <LogOut size={14} />, onSelect: logout },
            ]}
          />
          <Tooltip content="New task" shortcut="C">
            <IconButton label="New task" icon={<SquarePen size={15} />} onClick={() => shell.newTask()} variant="secondary" />
          </Tooltip>
        </div>
        <button className={s.search} onClick={shell.openCommand}>
          <Search size={14} />
          <span style={{ flex: 1, textAlign: "left" }}>Search or jump to…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      <nav className={s.scroll}>
        {visibleNav(can).map((sec, i) => (
          <div key={i} className={sec.title ? s.section : undefined}>
            {sec.title && <div className={s.sectionTitle}>{sec.title}</div>}
            {sec.items.map((it) => {
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
        ))}
      </nav>
      <div className={s.bottom}>
        <TimerWidget />
        <button className={s.user} onClick={() => nav("/settings/account")}>
          <Avatar name={me.user.name} size={22} />
          <span className="grow">
            <span className="ellipsis medium" style={{ display: "block" }}>{me.user.name}</span>
            <span className="ellipsis faint tiny" style={{ display: "block" }}>{me.user.role === "ADMIN" ? "Admin" : me.user.role === "MANAGER" ? "Manager" : "Employee"}{me.user.title ? ` · ${me.user.title}` : ""}</span>
          </span>
          {me.user.mfaEnabled && <Check size={13} className="success" aria-label="Two-factor on" />}
        </button>
      </div>
    </aside>
  );
}
