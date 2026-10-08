import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Building2, CircleDot, FolderKanban, Lock, Plus, Receipt, Search, Tag, UserRound, X } from "lucide-react";
import { Avatar, AvatarGroup, Button, Combobox, EmptyState, ErrorState, Input, Select, SkeletonRows } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { HealthBadge } from "./health-badge";
import { useApi, useDebounced, useLocal } from "@/lib/hooks";
import { fmtDate, hours, pct } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useOptions } from "../tasks/lib";
import { BILLING, BILLING_TYPES, PROJECT_STATUS, PROJECT_STATUSES, type Project } from "./lib";
import { ProjectFormDialog } from "./project-form";
import t from "../tasks/tasks.module.css";
import s from "./projects.module.css";

interface Filters { status: string[]; clientId: number | null; managerId: number | null; archived: "false" | "true" | "all"; billing: string[]; tag: string | null }
const EMPTY: Filters = { status: [], clientId: null, managerId: null, archived: "false", billing: [], tag: null };

function Chip({ active, icon, children }: { active: boolean; icon: ReactNode; children: ReactNode }) {
  return <button type="button" className={`${t.filterChip} ${active ? t.active : ""}`}>{icon}{children}</button>;
}

/** Linear-style projects list with health, progress and tracked-vs-estimate. */
export default function Projects() {
  const { can } = useMe();
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
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF({ ...f, [k]: v });
  const active = f.status.length || f.clientId || f.managerId || f.billing.length || f.tag || f.archived !== "false" || q;
  const users = opts.data?.users ?? [];
  const clients = opts.data?.clients ?? [];

  const toolbar = (
    <>
      <Input size="sm" style={{ width: 200 }} icon={<Search size={14} />} placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
      <Combobox multiple value={f.status} width={200} onChange={(v) => set("status", v)} options={PROJECT_STATUSES.map((x) => ({ value: x, label: PROJECT_STATUS[x].label }))}
        trigger={<Chip active={f.status.length > 0} icon={<CircleDot size={13} />}>{f.status.length ? f.status.map((x) => PROJECT_STATUS[x as keyof typeof PROJECT_STATUS].label).join(", ") : "Status"}</Chip>} />
      <Combobox value={f.clientId} clearable clearLabel="Any client" width={240} onChange={(v) => set("clientId", v ? Number(v) : null)} options={clients.map((c) => ({ value: c.id, label: c.name }))}
        trigger={<Chip active={!!f.clientId} icon={<Building2 size={13} />}>{clients.find((c) => c.id === f.clientId)?.name ?? "Client"}</Chip>} />
      <Combobox value={f.managerId} clearable clearLabel="Any manager" width={240} onChange={(v) => set("managerId", v ? Number(v) : null)} options={users.filter((u) => u.role !== "EMPLOYEE").map((u) => ({ value: u.id, label: u.name, icon: <Avatar name={u.name} size={16} /> }))}
        trigger={<Chip active={!!f.managerId} icon={<UserRound size={13} />}>{users.find((u) => u.id === f.managerId)?.name ?? "Manager"}</Chip>} />
      <Combobox multiple value={f.billing} width={200} onChange={(v) => set("billing", v)} options={BILLING_TYPES.map((b) => ({ value: b, label: BILLING[b] }))}
        trigger={<Chip active={f.billing.length > 0} icon={<Receipt size={13} />}>{f.billing.length ? f.billing.map((b) => BILLING[b as keyof typeof BILLING]).join(", ") : "Billing"}</Chip>} />
      {(opts.data?.tags.length ?? 0) > 0 && (
        <Combobox value={f.tag} clearable clearLabel="Any tag" width={200} onChange={(v) => set("tag", v)} options={(opts.data?.tags ?? []).map((x) => ({ value: x, label: x }))}
          trigger={<Chip active={!!f.tag} icon={<Tag size={13} />}>{f.tag ?? "Tag"}</Chip>} />
      )}
      {manage && (
        <Select size="sm" fullWidth={false} value={f.archived} onChange={(v) => set("archived", v as Filters["archived"])} aria-label="Archived"
          options={[{ value: "false", label: "Active projects" }, { value: "true", label: "Archived" }, { value: "all", label: "All projects" }]} />
      )}
      {active ? <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setQ(""); setF(EMPTY); }}>Clear</Button> : null}
    </>
  );

  let body: ReactNode;
  if (list.error && !list.data) body = <ErrorState error={list.error} onRetry={list.reload} />;
  else if (!list.data) body = <SkeletonRows rows={8} />;
  else if (!list.data.length) {
    body = active
      ? <EmptyState title="No projects match" description="Try a different filter." action={<Button variant="secondary" onClick={() => { setQ(""); setF(EMPTY); }}>Clear filters</Button>} />
      : <EmptyState icon={<FolderKanban size={28} />} title="No projects yet" description="Projects hold tasks, milestones and tracked time." action={manage ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New project</Button> : undefined} />;
  } else {
    body = (
      <div className="table-wrap">
        <table className={`table ${s.table}`}>
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Name</th><th>Health</th><th>Status</th><th>Lead</th><th className="hide-sm">Client</th><th>Progress</th>
              <th className="hide-sm">Target</th><th className="num">Tracked / est.</th><th className="hide-sm">Members</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((p) => {
              const locked = p.access === "none" && !manage;
              const tracked = (p.stats?.trackedMinutes ?? 0);
              const over = p.estimatedHours != null && tracked / 60 > p.estimatedHours;
              return (
                <tr key={p.id} className={`${locked ? "" : "clickable"} ${p.archived ? s.archived : ""}`} onClick={() => !locked && nav(`/projects/${p.id}`)} title={locked ? "You're not a member of this project" : undefined}>
                  <td style={{ paddingLeft: 20 }}>
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
