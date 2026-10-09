import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail, Phone, UserCog, Users } from "lucide-react";
import { Page } from "@/components/app/page";
import { useShell } from "@/components/app/shell-context";
import { PriorityIcon, StatusIcon } from "@/components/app/icons";
import { Avatar, Button, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { addDays, dueLabel, fmtDate, fmtDateTime, hm, hours, monthEnd, monthStart, today, weekStart } from "@/lib/format";
import type { Task } from "@/lib/types";
import { Prop, RoleBadge, StatusBadge } from "../admin/shared";
import type { DirPerson } from "./people";
import s from "./people.module.css";

type Group = { id: string | number | null; name: string; minutes: number; billableMinutes: number };
type EntryRow = { id: number; date: string; minutes: number; description: string; project: string; projectColor: string; subProject: string | null; task: string | null; taskId: number | null; billable: boolean };

export default function Person() {
  const { id } = useParams();
  const pid = Number(id);
  const nav = useNavigate();
  const { me, can } = useMe();
  const { openTask } = useShell();
  const dir = useApi<DirPerson[]>("/people", { status: can("directory", "full") ? "ACTIVE,INVITED,DEACTIVATED" : undefined });
  const p = dir.data?.find((x) => x.id === pid);

  const self = pid === me.user.id;
  const seeTime = self ? can("analytics", "own") : can("analytics", "all");
  const t0 = today();
  const ws = weekStart(t0, me.company.weekStartsOn);
  const weekMin = useApi<Group[]>(seeTime ? "/analytics/group" : null, { groupBy: "employee", userId: pid, from: ws, to: addDays(ws, 6) });
  const monthMin = useApi<Group[]>(seeTime ? "/analytics/group" : null, { groupBy: "employee", userId: pid, from: monthStart(t0), to: monthEnd(t0) });
  const entries = useApi<{ rows: EntryRow[] }>(seeTime ? "/analytics/entries" : null, { userId: pid, from: addDays(t0, -30), to: t0, limit: 12 });
  const tasks = useApi<Task[]>(p ? "/tasks" : null, { assigneeId: String(pid), includeDone: "false", parent: "all" });

  if (dir.error) return <Page title="Employee"><ErrorState error={dir.error} onRetry={dir.reload} /></Page>;
  if (!dir.data) return <Page title="Employee"><SkeletonRows /></Page>;
  if (!p) return <Page title="Employee"><EmptyState icon={<Users size={28} />} title="Person not found" description="They may have left this company, or the directory hides them." action={<Button onClick={() => nav("/people")}>Back to employees</Button>} /></Page>;

  const sum = (g?: Group[]) => (g ?? []).reduce((a, x) => a + x.minutes, 0);
  const cap = p.weeklyCapacity ?? me.company.hoursPerDay * me.company.workWeek.split(",").length;
  const open = (tasks.data ?? []).slice().sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  return (
    <Page
      title={<span className="row gap-4"><Link to="/people" className="muted row gap-4"><ArrowLeft size={14} />Employees</Link><span className="faint">/</span>{p.name}</span>}
      actions={can("people", "invite") && <Button size="sm" variant="ghost" icon={<UserCog size={14} />} onClick={() => nav(`/admin/users?q=${encodeURIComponent(p.email)}`)}>Manage in Users</Button>}
    >
      <div className={s.profile}>
        <div className={s.main}>
          <div className={s.hero}>
            <Avatar name={p.name} size={48} />
            <div className="col gap-4">
              <h2>{p.name}</h2>
              <div className="row muted">{p.title ?? "No title"}{p.team && <><span className="faint">·</span><span className="dot" style={{ background: p.team.color }} />{p.team.name}</>}</div>
            </div>
          </div>

          {seeTime && (
            <section>
              <div className="section-title">Hours</div>
              <div className={s.stats}>
                <div className="stat"><div className="stat-label">This week</div><div className="stat-value">{hours(sum(weekMin.data))}h</div><div className="stat-sub">of {cap}h capacity</div></div>
                <div className="stat"><div className="stat-label">This month</div><div className="stat-value">{hours(sum(monthMin.data))}h</div><div className="stat-sub">{hours((monthMin.data ?? []).reduce((a, x) => a + x.billableMinutes, 0))}h billable</div></div>
                <div className="stat"><div className="stat-label">Open tasks</div><div className="stat-value">{tasks.data?.length ?? "—"}</div><div className="stat-sub">{open.filter((t) => t.overdue).length} overdue</div></div>
              </div>
            </section>
          )}

          <section>
            <div className="section-title">Current tasks</div>
            {tasks.loading && !tasks.data ? <SkeletonRows rows={3} /> : !open.length ? <p className="faint small">No open tasks.</p> : (
              <div>
                {open.slice(0, 25).map((t) => (
                  <div key={t.id} className={s.taskRow} role="button" tabIndex={0} onClick={() => openTask(t.id)} onKeyDown={(e) => e.key === "Enter" && openTask(t.id)}>
                    <PriorityIcon priority={t.priority} />
                    <span className="faint small num" style={{ width: 64 }}>{t.key}</span>
                    <StatusIcon status={t.status} />
                    <span className="grow ellipsis">{t.title}</span>
                    {t.project && <span className="row small muted ellipsis" style={{ maxWidth: 200 }}><span className="dot" style={{ background: t.project.color }} />{t.project.parent ? `${t.project.parent.name} › ` : ""}{t.project.name}</span>}
                    {t.dueDate && <span className={`small num ${t.overdue ? "danger" : "muted"}`} style={{ width: 80, textAlign: "right" }}>{dueLabel(t.dueDate)}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {seeTime && (
            <section>
              <div className="section-title">Recent time <span className="faint">· last 30 days</span></div>
              {entries.loading && !entries.data ? <SkeletonRows rows={3} /> : !entries.data?.rows.length ? <p className="faint small">No time logged in the last 30 days.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Date</th><th>Project</th><th>Task</th><th>Description</th><th className="num">Time</th></tr></thead>
                    <tbody>
                      {entries.data.rows.map((e) => (
                        <tr key={e.id} className={e.taskId ? "clickable" : undefined} onClick={() => e.taskId && openTask(e.taskId)}>
                          <td className="muted num">{fmtDate(e.date)}</td>
                          <td><span className="row"><span className="dot" style={{ background: e.projectColor }} />{e.project}{e.subProject && <span className="faint">› {e.subProject}</span>}</span></td>
                          <td className="ellipsis" style={{ maxWidth: 220 }}>{e.task ?? <span className="faint">—</span>}</td>
                          <td className="ellipsis muted" style={{ maxWidth: 320 }}>{e.description}</td>
                          <td className="num">{hm(e.minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className={s.aside}>
          <div className="section-title">Details</div>
          <Prop label="Role"><RoleBadge role={p.role} /></Prop>
          {p.status !== "ACTIVE" && <Prop label="Status"><StatusBadge status={p.status} /></Prop>}
          <Prop label="Email"><a className="link row gap-4" href={`mailto:${p.email}`}><Mail size={13} />{p.email}</a></Prop>
          {p.phone !== undefined && <Prop label="Phone">{p.phone ? <span className="row gap-4"><Phone size={13} />{p.phone}</span> : null}</Prop>}
          <Prop label="Location">{p.location}</Prop>
          <Prop label="Team">{p.team ? <span className="row"><span className="dot" style={{ background: p.team.color }} />{p.team.name}</span> : null}</Prop>
          {p.weeklyCapacity !== undefined && <Prop label="Capacity">{p.weeklyCapacity}h / week</Prop>}
          {p.lastLoginAt !== undefined && <Prop label="Last sign-in">{p.lastLoginAt ? fmtDateTime(p.lastLoginAt) : "Never"}</Prop>}
          {p.projects !== undefined && (
            <>
              <div className="section-title" style={{ marginTop: 16 }}>Projects</div>
              {p.allProjects ? <span className="muted small">All projects</span> : !p.projects.length ? <span className="faint small">No project access</span> : p.projects.map((pr) => (
                <Link key={pr.id} to={`/projects/${pr.id}`} className="row prop-chip"><span className="dot" style={{ background: pr.color }} /><span className="ellipsis">{pr.name}</span></Link>
              ))}
            </>
          )}
        </aside>
      </div>
    </Page>
  );
}
