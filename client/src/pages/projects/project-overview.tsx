import { AlertTriangle, CheckCircle2, ExternalLink, FileText, PenTool, HardDrive, Link2 } from "lucide-react";
import { Avatar, AvatarGroup, Badge } from "@/components/arc";
import { HEALTH_META, PRIORITY_META, PriorityIcon, ProjectDot } from "@/components/app/icons";
import { daysBetween, fmtDate, hm, hours, money, pct, today } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Priority } from "@/lib/types";
import { BILLING, PROJECT_STATUS, type MilestoneRow, type ProjectDetail } from "./lib";
import s from "./projects.module.css";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  return <div className="stat"><div className="stat-label">{label}</div><div className={`stat-value ${tone ?? ""}`}>{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>;
}

export function MilestoneTimeline({ milestones, start, end }: { milestones: MilestoneRow[]; start: string | null; end: string | null }) {
  if (!milestones.length) return <p className="small faint">No milestones yet.</p>;
  const dates = milestones.map((m) => m.date).sort();
  const from = start && start < dates[0] ? start : dates[0];
  const to = end && end > dates[dates.length - 1] ? end : dates[dates.length - 1];
  const span = Math.max(1, daysBetween(from, to));
  const at = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(from, d) / span) * 100))}%`;
  const t0 = today();
  return (
    <div>
      <div className={s.timeline}>
        <div className={s.timelineLine} />
        {t0 >= from && <div className={s.timelineFill} style={{ width: at(t0 > to ? to : t0) }} />}
        {t0 >= from && t0 <= to && <><div className={s.today} style={{ left: at(t0) }} /><div className={s.todayLabel} style={{ left: at(t0) }}>Today</div></>}
        {milestones.map((m) => (
          <div key={m.id} className={`${s.ms} ${m.done ? s.msDone : m.date < t0 ? s.msLate : ""}`} style={{ left: at(m.date) }} title={`${m.name} · ${fmtDate(m.date, true)}${m.done ? " · done" : m.date < t0 ? " · missed" : ""}`}>
            <span className={s.msDiamond} />
            <span className={s.msLabel}>{m.name}<br /><span className="faint">{fmtDate(m.date)}</span></span>
          </div>
        ))}
      </div>
      <div className={s.timelineEnds}><span>{fmtDate(from, true)}</span><span>{fmtDate(to, true)}</span></div>
    </div>
  );
}

export function ProjectProperties({ p }: { p: ProjectDetail }) {
  const { me } = useMe();
  const row = (label: string, v: React.ReactNode) => <div className="prop-row"><span className="prop-label">{label}</span><div>{v ?? <span className="faint">—</span>}</div></div>;
  const links = [
    p.links.figma && { icon: <PenTool size={13} />, label: "Figma", url: p.links.figma },
    p.links.document && { icon: <FileText size={13} />, label: "Document", url: p.links.document },
    p.links.drive && { icon: <HardDrive size={13} />, label: "Google Drive", url: p.links.drive },
    ...(p.links.other ?? []).map((o) => ({ icon: <Link2 size={13} />, label: o.label, url: o.url })),
  ].filter(Boolean) as { icon: React.ReactNode; label: string; url: string }[];
  return (
    <>
      <div>
        <div className="section-title">Properties</div>
        {row("Status", <Badge tone={PROJECT_STATUS[p.status].tone} size="sm">{PROJECT_STATUS[p.status].label}</Badge>)}
        {row("Health", p.stats && <Badge tone={HEALTH_META[p.stats.health].tone} dot size="sm">{HEALTH_META[p.stats.health].label}</Badge>)}
        {row("Priority", <span className="row gap-4"><PriorityIcon priority={p.priority as Priority} />{PRIORITY_META[p.priority as Priority]?.label}</span>)}
        {row("Lead", p.manager && <span className="row gap-4"><Avatar name={p.manager.name} size={18} />{p.manager.name}</span>)}
        {row("Team", p.team?.name)}
        {row("Start", p.startDate && fmtDate(p.startDate, true))}
        {row("Target", p.endDate && fmtDate(p.endDate, true))}
        {row("Billing", BILLING[p.billingType])}
        {p.hourlyRate != null && row("Rate", `${money(p.hourlyRate, me.company.currency)}/h`)}
        {p.budget != null && row("Budget", money(p.budget, me.company.currency))}
        {p.initiative && row("Initiative", <span className="row gap-4"><ProjectDot color={p.initiative.color} />{p.initiative.name}</span>)}
        {row("Tags", p.tags.length ? p.tags.map((t) => <Badge key={t} size="sm" variant="outline">{t}</Badge>) : null)}
        {row("Members", p.members.length ? <AvatarGroup names={p.members.map((m) => m.name)} max={6} size={20} /> : null)}
      </div>
      {p.client && (
        <div>
          <div className="section-title">Client</div>
          <div className="col" style={{ gap: 2 }}>
            <span className="medium">{p.client.name}</span>
            {p.client.contactName && <span className="small muted">{p.client.contactName}</span>}
            {p.client.email && <a className="small link" href={`mailto:${p.client.email}`}>{p.client.email}</a>}
            {p.client.phone && <span className="small muted">{p.client.phone}</span>}
          </div>
        </div>
      )}
      <div>
        <div className="section-title">Resources</div>
        {links.length ? links.map((l) => (
          <a key={l.url + l.label} className={s.linkRow} href={l.url} target="_blank" rel="noopener noreferrer">{l.icon}<span className="ellipsis grow">{l.label}</span><ExternalLink size={12} className="faint" /></a>
        )) : <span className="small faint">No links. Add Figma, docs or Drive links in Settings.</span>}
      </div>
    </>
  );
}

export function Overview({ p }: { p: ProjectDetail }) {
  const { me } = useMe();
  const st = p.stats;
  const tracked = st?.trackedMinutes ?? 0;
  const est = p.estimatedHours;
  const variance = est != null ? tracked / 60 - est : null;
  const showMoney = st?.revenue !== undefined;
  return (
    <div className={s.overview}>
      <div className={s.mainCol}>
        <div className="col" style={{ gap: 8 }}>
          <div className={s.projTitle}><ProjectDot color={p.color} size={12} />{p.name}{p.code && <span className="faint" style={{ fontSize: 14, fontWeight: 400 }}>{p.code}</span>}</div>
          {p.description ? <p className={s.desc}>{p.description}</p> : <p className="faint">No description.</p>}
        </div>
        {st && (
          <div className={s.kpis}>
            <Stat label="Progress" value={pct(st.progress)} sub={`${st.tasks.done} of ${st.tasks.total} tasks done`} />
            <Stat label="Tracked" value={`${hours(tracked, 0)}h`} sub={`${hm(st.billableMinutes)} billable`} />
            <Stat label="Estimate" value={est != null ? `${est}h` : "—"} sub={variance != null ? `${variance > 0 ? "+" : ""}${variance.toFixed(0)}h ${variance > 0 ? "over" : "remaining"}` : `${st.tasks.estimateHours}h in task estimates`} tone={variance != null && variance > 0 ? "danger" : undefined} />
            {showMoney
              ? <Stat label="Revenue" value={money(st.revenue, me.company.currency)} sub={st.budgetRemaining != null ? `${money(st.budgetRemaining, me.company.currency)} of budget left` : `Cost ${money(st.cost, me.company.currency)}`} tone={st.budgetRemaining != null && st.budgetRemaining < 0 ? "danger" : undefined} />
              : <Stat label="Open issues" value={String(st.tasks.overdue + st.tasks.blocked)} sub={`${st.tasks.overdue} overdue · ${st.tasks.blocked} blocked`} tone={st.tasks.overdue ? "danger" : undefined} />}
          </div>
        )}
        {st && (
          <section>
            <div className="section-title">Health</div>
            <div className="row" style={{ marginBottom: 8 }}>
              <Badge tone={HEALTH_META[st.health].tone} dot>{HEALTH_META[st.health].label}</Badge>
              {st.nextMilestone && <span className="small muted">Next milestone: {st.nextMilestone.name}, {fmtDate(st.nextMilestone.date)}</span>}
            </div>
            <ul className={s.reasons}>
              {st.reasons.length
                ? st.reasons.map((r) => <li key={r}><AlertTriangle size={13} className={st.health === "DELAYED" ? "danger" : "warn"} />{r}</li>)
                : <li><CheckCircle2 size={13} className="success" />No overdue work, conflicts or overruns.</li>}
              {st.tasks.conflicts > 0 && !st.reasons.some((r) => r.includes("conflict")) && <li><AlertTriangle size={13} className="warn" />{st.tasks.conflicts} dependency conflicts</li>}
            </ul>
          </section>
        )}
        <section>
          <div className="section-title">Milestones</div>
          <MilestoneTimeline milestones={p.milestones} start={p.startDate} end={p.endDate} />
        </section>
      </div>
      <aside className={s.side}><ProjectProperties p={p} /></aside>
    </div>
  );
}
