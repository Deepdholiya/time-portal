import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Building2, CircleDot, FolderKanban, Lock, Plus, Receipt, Tag, UserRound, X } from "lucide-react";
import { Avatar, AvatarGroup, Button, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { FilterMenu } from "@/components/app/filter-menu";
import { ProjectDot } from "@/components/app/icons";
import { HealthBadge } from "./health-badge";
import { useApi, useDebounced, useLocal } from "@/lib/hooks";
import { fmtDate, hours, pct } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useOptions } from "../tasks/lib";
import { BILLING, BILLING_TYPES, PROJECT_STATUS, PROJECT_STATUSES, type Project } from "./lib";
import { ProjectFormDialog } from "./project-form";
import { ProjectActions } from "./project-actions";
import s from "./projects.module.css";
import { SearchField } from "@/components/app/search-field";

interface Filters { status: string[]; clientId: number | null; managerId: number | null; archived: "false" | "true" | "all"; billing: string[]; tag: string | null }
const EMPTY: Filters = { status: [], clientId: null, managerId: null, archived: "false", billing: [], tag: null };


/** Linear-style projects list with health, progress and tracked-vs-estimate. */
export default function Projects() {
  const { can, isAdmin } = useMe();
  const nav = useNavigate();
  const manage = can("projects", "manage");
  const opts = useOptions();
  const [f, setF] = useLocal<Filters>("projects:filters", EMPTY);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [creating, setCreating] = useState(false);
  const list = useApi<Project[]>("/projects", {
    status: f.status.join(","), clientId: f.clientId, managerId: f.managerId, archived: manage ? f.archived : "false", billing: f.billing.join(","), tag: f.tag, q: dq,
  });
  const active = f.status.length || f.clientId || f.managerId || f.billing.length || f.tag || f.archived !== "false" || q;
  const users = opts.data?.users ?? [];
  const clients = opts.data?.clients ?? [];

  const toolbar = (
    <>
      <SearchField placeholder="Search projects…" value={q} onChange={setQ} />
      <FilterMenu placement="bottom-start"
        sections={[
          { key: "status", label: "Status", icon: <CircleDot size={13} />, options: PROJECT_STATUSES.map((x) => ({ value: x, label: PROJECT_STATUS[x].label })) },
          { key: "client", label: "Client", icon: <Building2 size={13} />, single: true, options: clients.map((c) => ({ value: String(c.id), label: c.name })) },
          { key: "manager", label: "Manager", icon: <UserRound size={13} />, single: true, options: users.filter((u) => u.role !== "EMPLOYEE").map((u) => ({ value: String(u.id), label: u.name, icon: <Avatar name={u.name} size={16} /> })) },
          ...(isAdmin ? [{ key: "billing", label: "Billing", icon: <Receipt size={13} />, options: BILLING_TYPES.map((b) => ({ value: b, label: BILLING[b] })) }] : []),
          ...((opts.data?.tags.length ?? 0) > 0 ? [{ key: "tag", label: "Tag", icon: <Tag size={13} />, single: true, options: (opts.data?.tags ?? []).map((x) => ({ value: x, label: x })) }] : []),
          ...(manage ? [{ key: "archived", label: "Show", icon: <Archive size={13} />, single: true, required: true, defaultValue: "false", options: [{ value: "false", label: "Active projects" }, { value: "true", label: "Archived" }, { value: "all", label: "All projects" }] }] : []),
        ]}
        value={{ status: f.status, client: f.clientId ? [String(f.clientId)] : [], manager: f.managerId ? [String(f.managerId)] : [], billing: f.billing, tag: f.tag ? [f.tag] : [], archived: [f.archived] }}
        onApply={(v) => setF({
          status: v.status ?? [], clientId: v.client?.[0] ? Number(v.client[0]) : null, managerId: v.manager?.[0] ? Number(v.manager[0]) : null,
          billing: v.billing ?? [], tag: v.tag?.[0] ?? null, archived: ((v.archived?.[0] as Filters["archived"]) ?? "false"),
        })}
      />
      {active ? <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setQ(""); setF(EMPTY); }}>Clear</Button> : null}
      <span className="grow" />
    </>
  );

  let body: ReactNode;
  if (list.error && !list.data) body = <ErrorState error={list.error} onRetry={list.reload} />;
  else if (!list.data) body = <SkeletonRows rows={8} />;
  else if (!list.data.length) {
    body = active
      ? <EmptyState title="No projects match" description="Try a different filter." action={<Button variant="secondary" onClick={() => { setQ(""); setF(EMPTY); }}>Clear filters</Button>} />
      : <EmptyState icon={<FolderKanban size={28} />} title="No projects yet" description="Projects hold tasks, milestones and tracked time." action={manage ? <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New project</Button> : undefined} />;
  } else {
    body = (
      <div className="table-wrap">
        <table className={`table ${s.table}`}>
          <thead>
            <tr>
              <th>Name</th><th>Health</th><th>Status</th><th>Lead</th><th className="hide-sm">Client</th><th>Progress</th>
              <th className="hide-sm">Target</th><th className="num">Tracked / est.</th><th className="hide-sm">Members</th>{manage && <th style={{ width: 44 }} />}
            </tr>
          </thead>
          <tbody>
            {list.data.map((p) => {
              const locked = p.access === "none" && !manage;
              const tracked = (p.stats?.trackedMinutes ?? 0);
              const over = p.estimatedHours != null && tracked / 60 > p.estimatedHours;
              return (
                <tr key={p.id} className={`${locked ? "" : "clickable"} ${p.archived ? s.archived : ""}`} onClick={() => !locked && nav(`/projects/${p.id}`)} title={locked ? "You're not a member of this project" : undefined}>
                  <td>
                    <div className={s.nameCell}>
                      <ProjectDot color={p.color} size={9} />
                      <span className={`${s.name} ellipsis`}>{p.name}</span>
                      {p.code && <span className={s.code}>{p.code}</span>}
                      {p.children.length > 0 && <span className="faint small">{p.children.length} sub</span>}
                      {locked && <Lock size={12} className={s.locked} aria-label="No access" />}
                      {p.archived && <Archive size={12} className="faint" aria-label="Archived" />}
                    </div>
                  </td>
                  <td><HealthBadge p={p} /></td>
                  <td><span className="muted">{PROJECT_STATUS[p.status]?.label}</span></td>
                  <td>{p.manager ? <span className="row gap-4"><Avatar name={p.manager.name} size={18} /><span className="ellipsis" style={{ maxWidth: 110 }}>{p.manager.name}</span></span> : <span className="faint">—</span>}</td>
                  <td className="hide-sm"><span className="ellipsis muted" style={{ maxWidth: 160, display: "block" }}>{p.client?.name ?? "—"}</span></td>
                  <td><div className={s.progressCell}><div className="progress"><span style={{ width: pct(p.stats?.progress) }} /></div><span className="small muted num">{pct(p.stats?.progress)}</span></div></td>
                  <td className="hide-sm"><span className={p.endDate && p.endDate < new Date().toISOString().slice(0, 10) && p.status !== "COMPLETED" ? "danger" : "muted"}>{p.endDate ? fmtDate(p.endDate) : "—"}</span></td>
                  <td className="num"><span className={over ? "danger" : ""}>{hours(tracked, 0)}h</span><span className="faint"> / {p.estimatedHours != null ? `${p.estimatedHours}h` : "—"}</span></td>
                  <td className="hide-sm">{p.members.length ? <AvatarGroup names={p.members.map((m) => m.name)} max={4} size={18} /> : <span className="faint">—</span>}</td>
                  {manage && <td><ProjectActions p={p} onChanged={list.reload} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1><FolderKanban size={15} className="faint" />Projects</h1>
        {list.data && <span className="faint small num">{list.data.length}</span>}
        <div className="grow" />
        {manage && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New project</Button>}
      </header>
      <div className="page-toolbar">{toolbar}</div>
      <div className="page-body">{body}</div>
      {creating && <ProjectFormDialog onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); nav(`/projects/${id}`); }} />}
    </div>
  );
}
