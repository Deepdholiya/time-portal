import { Link } from "react-router-dom";
import { AlertTriangle, Building2, CalendarDays, Check, CheckCircle2, Clock, ExternalLink, FileText, Flag, FolderTree, HardDrive, HeartPulse, Link2, PenTool, Pencil, Wallet } from "lucide-react";
import { Avatar, AvatarGroup, Badge, Button } from "@/components/ui";
import { HEALTH_META, PRIORITY_META, PriorityIcon, ProjectDot } from "@/components/app/icons";
import { daysBetween, fmtDate, hm, hours, money, pct, today } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Priority } from "@/lib/types";
import { BILLING, PROJECT_STATUS, type MilestoneRow, type ProjectDetail } from "./lib";
import s from "./projects.module.css";


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
  const { me, isAdmin } = useMe();
  const cur = p.currency || me.company.currency;
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
        {isAdmin && row("Billing", BILLING[p.billingType])}
        {isAdmin && p.hourlyRate != null && row("Rate", `${money(p.hourlyRate, cur)}/h`)}
        {isAdmin && p.budget != null && row("Budget", money(p.budget, cur))}
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

function Meter({ label, value, sub, ratio, tone, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; ratio?: number | null; tone?: "danger" | "warn" | "success"; icon: React.ReactNode }) {
  const color = tone === "danger" ? "var(--red)" : tone === "warn" ? "var(--yellow)" : tone === "success" ? "var(--green)" : "var(--accent)";
  return (
    <div className={s.meter}>
      <div className={s.meterHead}><span className={s.meterIcon}>{icon}</span>{label}</div>
      <div className={`${s.meterValue} ${tone === "danger" ? "danger" : ""}`}>{value}</div>
      {ratio != null && <div className={s.meterTrack}><span style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%`, background: color }} /></div>}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Project overview: a summary header, four progress meters, milestones and health side by side, and the properties panel. */
export function Overview({ p, onEdit }: { p: ProjectDetail; onEdit?: () => void }) {
  const { me, isAdmin } = useMe();
  const cur = p.currency || me.company.currency;
  const st = p.stats;
  const tracked = st?.trackedMinutes ?? 0;
  const est = p.estimatedHours;
  const t0 = today();
  const daysLeft = p.endDate ? daysBetween(t0, p.endDate) : null;
  const showMoney = isAdmin && st?.revenue !== undefined;
  const used = p.budget && st?.budgetRemaining != null ? (p.budget - st.budgetRemaining) / p.budget : null;
  const ms = [...p.milestones].sort((a, b) => a.date.localeCompare(b.date));
  const initials = p.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={s.overview}>
      <div className={s.mainCol}>
        <section className={s.hero}>
          <div className={s.heroTile} style={{ background: p.color }}>{initials}</div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className={s.projTitle}>{p.name}{p.code && <span className={s.code}>{p.code}</span>}</div>
            <div className={s.heroMeta}>
              <Badge tone={PROJECT_STATUS[p.status].tone} size="sm">{PROJECT_STATUS[p.status].label}</Badge>
              {st && !p.parentId && <Badge tone={HEALTH_META[st.health].tone} dot size="sm">{HEALTH_META[st.health].label}</Badge>}
              {p.client && <span className="row gap-4"><Building2 size={13} className="faint" />{p.client.name}</span>}
              {p.manager && <span className="row gap-4"><Avatar name={p.manager.name} size={16} />{p.manager.name}</span>}
              {(p.startDate || p.endDate) && <span className="row gap-4"><CalendarDays size={13} className="faint" />{p.startDate ? fmtDate(p.startDate) : "—"} → {p.endDate ? fmtDate(p.endDate, true) : "—"}
                {daysLeft != null && p.status !== "COMPLETED" && <span className={daysLeft < 0 ? "danger" : "faint"}>· {daysLeft < 0 ? `${-daysLeft}d overdue` : `${daysLeft}d left`}</span>}</span>}
            </div>
            {p.description ? <p className={s.desc}>{p.description}</p> : <p className="faint small">No description yet.</p>}
          </div>
          {onEdit && <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={onEdit}>Edit</Button>}
        </section>

        {st && (
          <div className={s.meters}>
            <Meter icon={<CheckCircle2 size={14} />} label="Progress" value={pct(st.progress)} ratio={st.progress} tone={st.progress >= 1 ? "success" : undefined} sub={`${st.tasks.done} of ${st.tasks.total} tasks done`} />
            <Meter icon={<Clock size={14} />} label="Time" value={<>{hours(tracked, 0)}h{est != null && <span className="faint" style={{ fontSize: 14, fontWeight: 400 }}> / {est}h</span>}</>}
              ratio={est ? tracked / 60 / est : null} tone={est && tracked / 60 > est ? "danger" : est && tracked / 60 > est * 0.85 ? "warn" : undefined}
              sub={est != null ? (tracked / 60 > est ? `${Math.round(tracked / 60 - est)}h over estimate` : `${Math.round(est - tracked / 60)}h remaining`) : `${hm(st.billableMinutes)} billable`} />
            {showMoney ? (
              <Meter icon={<Wallet size={14} />} label={used != null ? "Budget used" : "Revenue"} value={used != null ? pct(used) : money(st.revenue, cur)}
                ratio={used} tone={used != null && used > 1 ? "danger" : (used ?? 0) > 0.85 ? "warn" : undefined}
                sub={st.budgetRemaining != null ? `${money(st.budgetRemaining, cur)} of ${money(p.budget, cur)} left` : `Cost ${money(st.cost, cur)}`} />
            ) : (
              <Meter icon={<Clock size={14} />} label="Billable" value={hm(st.billableMinutes)} ratio={tracked ? st.billableMinutes / tracked : null} sub={tracked ? `${pct(st.billableMinutes / tracked)} of tracked time` : "No time yet"} />
            )}
            <Meter icon={<AlertTriangle size={14} />} label="Needs attention" value={String(st.tasks.overdue + st.tasks.blocked + st.tasks.conflicts)} tone={st.tasks.overdue ? "danger" : undefined}
              sub={`${st.tasks.overdue} overdue · ${st.tasks.blocked} blocked · ${st.tasks.conflicts} conflicts`} />
          </div>
        )}

        <div className={s.twoCol}>
          <section className={s.card}>
            <div className={s.cardHead}><Flag size={14} className="faint" />Milestones<span className="grow" />{st?.nextMilestone && <span className="small muted">Next: {st.nextMilestone.name}</span>}</div>
            {ms.length ? (
              <ul className={s.msList}>
                  {ms.map((m) => {
                    const late = !m.done && m.date < t0;
                    const d = daysBetween(t0, m.date);
                    return (
                      <li key={m.id}>
                        <span className={`${s.msDot} ${m.done ? s.msDotDone : late ? s.msDotLate : ""}`}>{m.done ? <Check size={10} /> : null}</span>
                        <span className="grow ellipsis">{m.name}</span>
                        <span className={`small ${late ? "danger" : "muted"}`}>{m.done ? "Done" : late ? `${-d}d late` : d === 0 ? "Today" : `in ${d}d`}</span>
                        <span className="small faint num" style={{ width: 52, textAlign: "right" }}>{fmtDate(m.date)}</span>
                      </li>
                    );
                  })}
                </ul>
            ) : <p className="small faint">No milestones yet. Add them from the Milestones tab.</p>}
          </section>
          {st && (
            <section className={s.card}>
              <div className={s.cardHead}><HeartPulse size={14} className="faint" />Health<span className="grow" /><Badge tone={HEALTH_META[st.health].tone} dot size="sm">{HEALTH_META[st.health].label}</Badge></div>
              <ul className={s.reasons}>
                {st.reasons.length
                  ? st.reasons.map((r) => <li key={r}><AlertTriangle size={13} className={st.health === "DELAYED" ? "danger" : "warn"} />{r}</li>)
                  : <li><CheckCircle2 size={13} className="success" />No overdue work, conflicts or overruns.</li>}
                {st.tasks.conflicts > 0 && !st.reasons.some((r) => r.includes("conflict")) && <li><AlertTriangle size={13} className="warn" />{st.tasks.conflicts} dependency conflicts</li>}
              </ul>
              {p.children.length > 0 && (
                <>
                  <div className={s.cardHead} style={{ marginTop: 16 }}><FolderTree size={14} className="faint" />Sub-projects</div>
                  {p.children.map((c) => (
                    <Link key={c.id} to={`/projects/${c.id}`} className={s.linkRow}><ProjectDot color={c.color} /><span className="ellipsis grow">{c.name}</span><Badge size="sm" tone={PROJECT_STATUS[c.status].tone}>{PROJECT_STATUS[c.status].label}</Badge></Link>
                  ))}
                </>
              )}
            </section>
          )}
        </div>
      </div>
      <aside className={s.side}><ProjectProperties p={p} /></aside>
    </div>
  );
}
