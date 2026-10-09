import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Diamond, Home as HomeIcon, Palmtree, PartyPopper } from "lucide-react";
import { Avatar, DateRangePicker, EmptyState, ErrorState, SegmentedControl, Skeleton, presetRange, type DateRange } from "@/components/ui";
import { Page } from "@/components/app/page";
import { PriorityIcon, ProjectDot, StatusIcon } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { useApi, useLocal } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { dueLabel, fmtDate, hm, pct, today } from "@/lib/format";
import type { Priority, Task, TaskStatus, TimeEntry } from "@/lib/types";
import { HoursByDay, HoursByProject, type Group } from "./home-charts";
import { HomeToday } from "./home-today";
import s from "./home.module.css";

type View = "my" | "team" | "company";
interface SchedTask { id: number; key: string; title: string; status: TaskStatus; priority: Priority; dueDate?: string | null; project?: { name: string; color: string } }
interface Dashboard {
  view: View; level: "own" | "all"; range: { from: string; to: string };
  kpis: { totalMinutes: number; billableMinutes: number; nonBillableMinutes: number; tasksCompleted: number; tasksDue: number; overdueTasks: number; blockedTasks: number; activeProjects: number; capacityMinutes: number; utilization: number | null; people: number };
  byProject: Group[]; byDay: Group[]; byEmployee: Group[]; taskStatus: Record<string, number>;
  schedule: {
    today: SchedTask[]; upcoming: SchedTask[];
    milestones: { id: number; name: string; date: string; project: { id: number; name: string; color: string } }[];
    leave: { id: number; user: { id: number; name: string }; type: string }[];
    holidays: { id: number; date: string; name: string }[];
  };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const { me, can } = useMe();
  const shell = useShell();
  const nav = useNavigate();
  const canAll = can("analytics", "all");
  const [savedView, setView] = useLocal<View>("home.view", "my");
  const view: View = canAll ? savedView : "my";
  const [range, setRange] = useState<DateRange>(() => presetRange("This week"));
  const t0 = today();

  const dash = useApi<Dashboard>("/analytics/dashboard", { view, from: range.from, to: range.to });
  const todayTime = useApi<TimeEntry[]>("/time", { from: t0, to: t0 });
  const dueTasks = useApi<Task[]>("/tasks", { assigneeId: "me", includeDone: "false", dueTo: t0 });
  const d = dash.data;
  const todayMin = (todayTime.data ?? []).reduce((a, e) => a + e.minutes, 0);

  // Today: overdue and due-today tasks plus anything in progress, overdue first.
  const todayList = useMemo(() => {
    const out = new Map<number, SchedTask & { overdue: boolean }>();
    for (const t of dueTasks.data ?? []) out.set(t.id, { id: t.id, key: t.key, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate, project: t.project, overdue: !!t.dueDate && t.dueDate < t0 });
    for (const t of d?.schedule.today ?? []) if (!out.has(t.id)) out.set(t.id, { ...t, overdue: !!t.dueDate && t.dueDate < t0 });
    return [...out.values()].sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }, [dueTasks.data, d, t0]);

  const upcoming = useMemo(() => {
    if (!d) return [];
    type Item = { key: string; date: string; icon: React.ReactNode; label: React.ReactNode; sub?: string; onClick?: () => void };
    const items: Item[] = [
      ...d.schedule.upcoming.map((t) => ({ key: `t${t.id}`, date: t.dueDate ?? "", icon: <StatusIcon status={t.status} />, label: t.title, sub: `${t.key} · ${t.project?.name ?? ""}`, onClick: () => shell.openTask(t.id) })),
      ...d.schedule.milestones.map((m) => ({ key: `m${m.id}`, date: m.date, icon: <Diamond size={13} color={m.project.color} strokeWidth={2.2} />, label: m.name, sub: `Milestone · ${m.project.name}`, onClick: () => nav(`/projects/${m.project.id}`) })),
      ...d.schedule.holidays.map((h) => ({ key: `h${h.id}`, date: h.date, icon: <PartyPopper size={13} color="var(--orange)" />, label: h.name, sub: "Company holiday" })),
    ];
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);
  }, [d, nav, shell]);

  const k = d?.kpis;
  const util = k?.utilization;
  const tiles = k ? [
    view === "my"
      ? { label: "Today", value: hm(todayMin), sub: `${todayTime.data?.length ?? 0} entries`, to: "/time" }
      : { label: "People", value: String(k.people), sub: `${k.activeProjects} active projects`, to: "/team-time" },
    { label: "Total time", value: hm(k.totalMinutes), sub: k.capacityMinutes ? `of ${hm(k.capacityMinutes)} capacity` : range.preset ?? "", to: view === "my" ? "/timesheet" : "/analytics" },
    { label: "Billable", value: hm(k.billableMinutes), sub: `${hm(k.nonBillableMinutes)} non-billable`, to: "/analytics" },
    { label: "Utilisation", value: util == null ? "—" : pct(util), sub: util == null ? "No capacity in range" : util > 1 ? "Over capacity" : util < 0.6 ? "Under-utilised" : "Healthy", tone: util != null && util > 1 ? "var(--orange)" : undefined, to: "/analytics" },
    { label: "Tasks due", value: String(k.tasksDue), sub: `${k.tasksCompleted} completed in range`, to: "/my-tasks" },
    { label: "Overdue", value: String(k.overdueTasks), sub: k.blockedTasks ? `${k.blockedTasks} blocked` : "Nothing blocked", tone: k.overdueTasks ? "var(--red)" : undefined, to: "/my-tasks" },
  ] : [];

  const viewOptions: { value: View; label: string }[] = [{ value: "my", label: "My work" }, { value: "team", label: "My team" }, { value: "company", label: "Company" }];

  return (
    <Page
      title="Home"
      icon={<HomeIcon size={15} className="faint" />}
      actions={
        <div className="row">
          {canAll && <SegmentedControl<View> aria-label="Dashboard view" options={viewOptions} value={view} onChange={setView} />}
          <DateRangePicker size="sm" value={range} onChange={setRange} presets={["Today", "Yesterday", "This week", "Last week", "This month", "Last month", "This quarter", "This year"]} />
        </div>
      }
    >
      <div className={s.body}>
        <div className={s.greet}>
          <h2>{greeting()}, {me.user.name.split(" ")[0]}</h2>
          <span className="muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
        </div>

        {dash.error ? <ErrorState error={dash.error} onRetry={dash.reload} /> : (
          <div className={s.kpis}>
            {!k ? Array.from({ length: 6 }, (_, i) => <div key={i} className={s.kpi}><Skeleton width={70} /><Skeleton width={50} height={20} style={{ marginTop: 8 }} /></div>)
              : tiles.map((t) => (
                <button key={t.label} type="button" className={s.kpi} onClick={() => nav(t.to)} title={`Open ${t.to.slice(1)}`}>
                  <div className={s.kpiLabel}>{t.label}</div>
                  <div className={s.kpiValue} style={{ color: t.tone }}>{t.value}</div>
                  <div className={s.kpiSub}>{t.sub}</div>
                </button>
              ))}
          </div>
        )}

        <div className={s.cols}>
          <div className={s.stack}>
            <section className={s.panel}>
              <div className={s.panelHead}>Today <span className="count">{todayList.length || ""}</span><span className="grow" /><a className="link small" onClick={() => nav("/my-tasks")}>My tasks</a></div>
              {dueTasks.loading && !dueTasks.data ? <div className={s.panelBody}><Skeleton /><Skeleton width="60%" style={{ marginTop: 10 }} /></div>
                : todayList.length === 0 ? <EmptyState compact title="Nothing due today" description="No overdue or due-today tasks. Nice." />
                : todayList.map((t) => (
                  <div key={t.id} className={s.taskRow} onClick={() => shell.openTask(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && shell.openTask(t.id)}>
                    <PriorityIcon priority={t.priority} />
                    <span className={s.taskKey}>{t.key}</span>
                    <StatusIcon status={t.status} />
                    <span className="grow ellipsis">{t.title}</span>
                    {t.project && <span className="row small muted hide-sm" style={{ gap: 6, maxWidth: 180 }}><ProjectDot color={t.project.color} /><span className="ellipsis">{t.project.name}</span></span>}
                    <span className={`${s.due} ${t.overdue ? s.overdue : ""}`}>{dueLabel(t.dueDate) || "In progress"}</span>
                  </div>
                ))}
            </section>

            <section className={s.panel}>
              <div className={s.panelHead}>Hours by {d && range.from < range.to && (new Date(range.to).getTime() - new Date(range.from).getTime()) / 864e5 > 31 ? "week" : "day"}<span className="grow" /><span className="small muted num">{k ? hm(k.totalMinutes) : ""}</span></div>
              <div className={s.panelBody}>{d ? <HoursByDay byDay={d.byDay} from={range.from} to={range.to} /> : <Skeleton height={200} />}</div>
            </section>

            {view !== "my" && d && (
              <section className={s.panel}>
                <div className={s.panelHead}>By person<span className="grow" /><a className="link small" onClick={() => nav("/team-time")}>Team time</a></div>
                {d.byEmployee.length === 0 ? <EmptyState compact title="No time logged by the team in this period" /> : d.byEmployee.map((g) => {
                  const max = d.byEmployee[0].minutes || 1;
                  return (
                    <div key={g.key} className={s.taskRow} onClick={() => nav(`/people/${g.id}`)}>
                      <Avatar name={g.name} size={18} />
                      <span className="ellipsis" style={{ width: 160 }}>{g.name}</span>
                      <span className="small faint ellipsis" style={{ width: 90 }}>{g.sub}</span>
                      <span className="grow" style={{ height: 4, borderRadius: 4, background: "var(--bg-active)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(g.minutes / max) * 100}%`, background: "var(--accent)" }} /></span>
                      <span className="num muted" style={{ width: 60, textAlign: "right" }}>{hm(g.minutes)}</span>
                    </div>
                  );
                })}
              </section>
            )}
          </div>

          <div className={s.stack}>
            {view === "my" && <HomeToday />}
            <section className={s.panel}>
              <div className={s.panelHead}>Hours by project<span className="grow" /><span className="small muted">{range.preset && range.preset !== "Custom" ? range.preset : `${fmtDate(range.from)} – ${fmtDate(range.to)}`}</span></div>
              <div className={s.panelBody} style={{ paddingTop: 6, paddingBottom: 8 }}>{d ? <HoursByProject groups={d.byProject} onOpen={(g) => nav(`/projects/${g.id}`)} /> : <Skeleton height={90} />}</div>
            </section>
            <section className={s.panel}>
              <div className={s.panelHead}>Coming up<span className="grow" /><a className="link small" onClick={() => nav("/calendar")}>Calendar</a></div>
              {d?.schedule.leave.length ? (
                <div className={s.schedRow}><Palmtree size={13} color="var(--green)" /><span className="grow small">Out today: {d.schedule.leave.map((l) => l.user.name).join(", ")}</span></div>
              ) : null}
              {!d ? <div className={s.panelBody}><Skeleton /></div> : upcoming.length === 0 ? <EmptyState compact icon={<CalendarDays size={20} />} title="Nothing scheduled in the next two weeks" /> : upcoming.map((u) => (
                <div key={u.key} className={s.schedRow} style={{ cursor: u.onClick ? "pointer" : undefined }} onClick={u.onClick}>
                  <span className={s.schedDate}>{u.date === t0 ? "Today" : fmtDate(u.date)}</span>
                  {u.icon}
                  <span className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis">{u.label}</div>
                    {u.sub && <div className="tiny faint ellipsis">{u.sub}</div>}
                  </span>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </Page>
  );
}
