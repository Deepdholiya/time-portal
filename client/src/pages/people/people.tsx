import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Users } from "lucide-react";
import { Page } from "@/components/app/page";
import { Avatar, Button, EmptyState, ErrorState, SkeletonRows, Tooltip } from "@/components/ui";
import { FilterMenu } from "@/components/app/filter-menu";
import { InviteDialog } from "../admin/invite-dialogs";
import { useApi, useDebounced, useLocal } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { addDays, hours, money, today, weekStart } from "@/lib/format";
import { RoleBadge, StatusBadge } from "../admin/shared";
import s from "./people.module.css";
import { SearchField } from "@/components/app/search-field";

export interface DirPerson {
  id: number; name: string; email: string; role: string; title?: string | null; status: string; location?: string | null;
  team: { id: number; name: string; color: string } | null;
  // Present only with full directory access.
  phone?: string | null; weeklyCapacity?: number; allProjects?: boolean; projects?: { id: number; name: string; color: string }[]; lastLoginAt?: string | null;
  billRate?: number | null; costRate?: number | null;
}
type Group = { id: number | string | null; minutes: number };

export default function People() {
  const { me, can, currency } = useMe();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [team, setTeam] = useLocal(`people:team:${me.company.id}`, "");
  const [role, setRole] = useLocal("people:role", "");
  const full = can("directory", "full");
  const [invite, setInvite] = useState(false);
  const [status, setStatus] = useLocal("people:status", "ACTIVE");
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useApi<DirPerson[]>("/people", { q: dq, teamId: team, role, status: full ? status : undefined });
  const teams = useApi<{ id: number; name: string; color: string }[]>("/people/teams/all");

  const ws = weekStart(today(), me.company.weekStartsOn);
  const allHours = can("analytics", "all");
  const week = useApi<Group[]>(can("analytics", "own") ? "/analytics/group" : null, { groupBy: "employee", from: ws, to: addDays(ws, 6) });
  const minutesBy = useMemo(() => new Map((week.data ?? []).map((g) => [Number(g.id), g.minutes])), [week.data]);
  const showRates = (data ?? []).some((p) => p.billRate !== undefined);
  const cols = ["minmax(220px, 2.2fr)", "minmax(110px, 1fr)", "90px", "minmax(160px, 1.4fr)", ...(full ? ["100px", "70px"] : []), "120px", ...(showRates ? ["90px"] : [])].join(" ");

  const toolbar = (
    <>
      <SearchField placeholder="Search name, email, title" value={q} onChange={setQ} />
      <FilterMenu placement="bottom-start"
        sections={[
          { key: "team", label: "Team", single: true, options: (teams.data ?? []).map((x) => ({ value: String(x.id), label: x.name, icon: <span className="dot" style={{ background: x.color }} /> })) },
          { key: "role", label: "Role", single: true, options: [{ value: "ADMIN", label: "Admins" }, { value: "MANAGER", label: "Managers" }, { value: "EMPLOYEE", label: "Employees" }] },
          ...(full ? [{ key: "status", label: "Status", single: true, required: true, defaultValue: "ACTIVE", options: [{ value: "", label: "Any status" }, { value: "ACTIVE", label: "Active" }, { value: "INVITED", label: "Invited" }, { value: "DEACTIVATED", label: "Inactive" }] }] : []),
        ]}
        value={{ team: team ? [team] : [], role: role ? [role] : [], status: [status] }}
        onApply={(v) => { setTeam(v.team?.[0] ?? ""); setRole(v.role?.[0] ?? ""); setStatus(v.status?.[0] ?? "ACTIVE"); }}
      />
      <div className="grow" />
      {data && <span className="small faint">{data.length} {data.length === 1 ? "person" : "people"}</span>}
    </>
  );

  return (
    <Page title="Employees" icon={<Users size={15} />} toolbar={toolbar}
      actions={can("people", "invite") && <Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setInvite(true)}>Add employee</Button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : !data?.length ? (
        <EmptyState icon={<Users size={28} />} title="No one matches" description="Try a different search or clear the filters." />
      ) : (
        <div className={s.list} role="table">
          <div className={`${s.row} ${s.head}`} role="row" style={{ gridTemplateColumns: cols }}>
            <span>Name</span><span>Team</span><span>Role</span><span >Email</span>
            {full && <span >Status</span>}
            {full && <span className="right">Capacity</span>}
            <span className="right">This week</span>
            {showRates && <span className="right">Bill rate</span>}
          </div>
          {data.map((p) => {
            const min = minutesBy.get(p.id);
            const visible = allHours || p.id === me.user.id;
            const cap = p.weeklyCapacity ?? 40;
            return (
              <div key={p.id} className={`${s.row} ${s.clickable}`} role="row" style={{ gridTemplateColumns: cols }} tabIndex={0} onClick={() => nav(`/people/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && nav(`/people/${p.id}`)}>
                <span className="row ellipsis">
                  <Avatar name={p.name} size={24} />
                  <span className="ellipsis">
                    <span className="medium">{p.name}</span>
                    {p.title && <span className="faint"> · {p.title}</span>}
                  </span>
                </span>
                <span className="row ellipsis">{p.team ? <><span className="dot" style={{ background: p.team.color }} />{p.team.name}</> : <span className="faint">—</span>}</span>
                <span><RoleBadge role={p.role} /></span>
                <span className="ellipsis muted">{p.email}</span>
                {full && <span ><StatusBadge status={p.status} /></span>}
                {full && <span className="right num muted">{cap}h</span>}
                <span className="right num">
                  {visible && min !== undefined ? (
                    <Tooltip content={`${hours(min)}h of ${cap}h capacity`}>
                      <span className={s.hours}>
                        <span className="progress" style={{ width: 48 }}><span style={{ width: `${Math.min(100, (min / 60 / cap) * 100)}%` }} /></span>
                        {hours(min)}h
                      </span>
                    </Tooltip>
                  ) : visible ? <span className="faint">0h</span> : <span className="faint">—</span>}
                </span>
                {showRates && <span className="right num muted">{p.billRate != null ? money(p.billRate, currency) : "—"}</span>}
              </div>
            );
          })}
        </div>
      )}
      {invite && <InviteDialog onClose={() => { setInvite(false); reload(); }} />}
    </Page>
  );
}
