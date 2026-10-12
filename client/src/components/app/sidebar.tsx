import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, ChevronsUpDown, Plus, Settings, Send } from "lucide-react";
import { Menu, Tooltip } from "@/components/ui";
import { get } from "@/lib/api";
import { useLocal } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { ProductMark } from "@/pages/auth/auth-layout";
import { sectionFor, visibleNav, type NavItem, type NavSection } from "./nav";
import { useShell } from "./shell-context";
import s from "./sidebar.module.css";

function useCounts() {
  const { can } = useSession();
  const [counts, setCounts] = useState({ inbox: 0, approvals: 0 });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [n, lv] = await Promise.all([
        get<{ unread: number }>("/notifications/count").catch(() => ({ unread: 0 })),
        can("leaveApprove", "yes") ? get<unknown[]>("/leave/approvals").catch(() => []) : Promise.resolve([]),
      ]);
      if (alive) setCounts({ inbox: n.unread, approvals: lv.length });
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
 * One-column navigation in the style of ElevenLabs: the product name, a workspace switcher, then every area's pages under a
 * small heading. Areas fold away (Admin starts folded unless you are on one of its pages). An invite card sits at the bottom
 * for people who can invite.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, can, switchCompany } = useSession();
  const shell = useShell();
  const nav = useNavigate();
  const loc = useLocation();
  const counts = useCounts();
  const sections = visibleNav(can);
  const current = sectionFor(sections, loc.pathname);
  const [folded, setFolded] = useLocal<Record<string, boolean>>("nav:folded", { admin: true });
  const [hideInvite, setHideInvite] = useLocal("nav:invite-hidden", false);
  if (!me) return null;
  const c = me.company;

  // Quick "+" actions on the rows where people most often create something.
  const quick: Record<string, { label: string; run: () => void }> = {
    "/tasks": { label: "New task", run: () => shell.newTask() },
    "/time": { label: "Log time", run: () => shell.logTime() },
  };

  const item = (it: NavItem) => {
    const n = it.badge ? counts[it.badge] : 0;
    const q = quick[it.to];
    return (
      <div key={it.to} className={s.itemWrap}>
        <NavLink to={it.to} end={it.to === "/"} onClick={onNavigate} className={({ isActive }) => `${s.item} ${isActive ? s.active : ""}`}>
          <it.icon size={18} strokeWidth={1.7} />
          <span className="ellipsis">{it.label}</span>
          {n > 0 && <span className={`${s.count} ${it.badge === "inbox" ? s.brandCount : ""}`}>{n}</span>}
        </NavLink>
        {q && (
          <Tooltip content={q.label} side="right">
            <button type="button" className={s.quick} aria-label={q.label} onClick={q.run}><Plus size={13} /></button>
          </Tooltip>
        )}
      </div>
    );
  };

  const section = (sec: NavSection) => {
    const items = sec.groups.flatMap((g) => g.items);
    if (sec.id === "home") return <div key={sec.id} className={s.section}>{items.map(item)}</div>;
    const closed = !!folded[sec.id] && sec.id !== current;
    return (
      <div key={sec.id} className={s.section}>
        <button type="button" className={s.sectionTitle} aria-expanded={!closed} onClick={() => setFolded({ ...folded, [sec.id]: !closed })}>
          {sec.label}
          <ChevronRight size={13} className={closed ? undefined : s.chevOpen} />
        </button>
        {!closed && items.map(item)}
      </div>
    );
  };

  return (
    <aside className={s.sidebar} aria-label="Main navigation">
      <div className={s.brandRow}>
        <ProductMark size={24} />
        <span className={s.wordmark}>Time Portal</span>
      </div>
      <div className={s.workspaceRow}>
        <Menu
          width={240}
          trigger={
            <button type="button" className={s.workspace} aria-label={`${c.name}: switch workspace`}>
              <span className={s.logo} style={{ background: c.color }}>{c.name[0]}</span>
              <span className="ellipsis grow">{c.name}</span>
              <ChevronsUpDown size={14} className="faint" />
            </button>
          }
          items={[
            { type: "heading", label: "Workspaces" },
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
      </div>
      <nav className={s.scroll} aria-label="Pages">
        {sections.map(section)}
      {can("people", "invite") && !hideInvite && (
        <div className={s.invite}>
          <button type="button" className={s.inviteClose} aria-label="Hide" onClick={() => setHideInvite(true)}>×</button>
          <span className={s.inviteIcon}><Send size={14} /></span>
          <button type="button" className={s.inviteBody} onClick={() => { nav("/admin/users?invite=1"); onNavigate?.(); }}>
            <span className="medium">Invite team members</span>
            <span className="small muted">Bring your team in to log time and plan work together.</span>
          </button>
        </div>
      )}
      </nav>
    </aside>
  );
}
