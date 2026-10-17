import { useMemo, useState } from "react";
import { CalendarPlus, PartyPopper, Plane, Plus, X, CalendarClock, Hourglass } from "lucide-react";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, IconButton, SkeletonRows, toast, type BadgeTone } from "@/components/ui";
import { Page } from "@/components/app/page";
import { del, post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { dayName, fmtDate, today } from "@/lib/format";
import { LEAVE_TYPES, RequestLeaveDialog } from "./request-dialog";
import s from "./leave.module.css";
import { MetricLabel } from "@/components/app/metric";

interface LeaveRequest { id: number; user?: { id: number; name: string }; type: string; from: string; to: string; halfDay: boolean; reason?: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; reviewNote?: string | null; reviewedBy?: { name: string } | null; days: number }
interface Holiday { id: number; date: string; name: string }

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pending", tone: "yellow" }, APPROVED: { label: "Approved", tone: "green" }, REJECTED: { label: "Declined", tone: "red" }, CANCELLED: { label: "Cancelled", tone: "gray" },
};
const typeLabel = (t: string) => LEAVE_TYPES.find((x) => x.value === t)?.label ?? t;

export default function Leave() {
  const { me, can } = useMe();
  const approver = can("leaveApprove", "yes");
  const admin = can("settings", "yes");
  const q = useApi<LeaveRequest[]>("/leave");
  const team = useApi<LeaveRequest[]>(approver ? "/leave/team" : null);
  const [addOpen, setAddOpen] = useState(false);
  const hol = useApi<Holiday[]>("/settings/holidays");
  const [open, setOpen] = useState(false);
  const [cancel, setCancel] = useState<LeaveRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const t0 = today();
  const year = t0.slice(0, 4);
  const workWeek = useMemo(() => new Set(me.company.workWeek.split(",").map(Number)), [me.company.workWeek]);
  const holidaySet = useMemo(() => new Set((hol.data ?? []).map((h) => h.date)), [hol.data]);

  const rows = q.data ?? [];
  const taken = rows.filter((r) => r.status === "APPROVED" && r.from.startsWith(year) && r.from <= t0).reduce((a, r) => a + r.days, 0);
  const booked = rows.filter((r) => r.status === "APPROVED" && r.from > t0).reduce((a, r) => a + r.days, 0);
  const pending = rows.filter((r) => r.status === "PENDING").reduce((a, r) => a + r.days, 0);
  const holidays = (hol.data ?? []).filter((h) => h.date.startsWith(year));

  const doCancel = async () => {
    if (!cancel) return;
    setBusy(true);
    try {
      await post(`/leave/${cancel.id}/cancel`);
      toast.success("Leave request cancelled");
      setCancel(null);
      q.reload();
      team.reload?.();
      invalidate("/calendar");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const removeHoliday = async (h: Holiday) => {
    try {
      await del(`/settings/holidays/${h.id}`);
      toast.success(`Removed ${h.name}`);
      hol.reload();
      invalidate("/calendar");
    } catch (e) { toast.error(e); }
  };
  const teamRows = (team.data ?? []).filter((r) => r.user?.id !== me.user.id && r.to >= t0);

  const fmtRange = (r: LeaveRequest) => (r.from === r.to ? `${dayName(r.from)}, ${fmtDate(r.from)}` : `${fmtDate(r.from)} – ${fmtDate(r.to)}`);

  return (
    <Page title="Leave" icon={<Plane size={15} className="faint" />} actions={
      <>
        {approver && <Button size="sm" variant="secondary" collapse icon={<CalendarPlus size={14} />} onClick={() => setAddOpen(true)}>Add leave or holiday</Button>}
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(true)}>Request leave</Button>
      </>
    }>
      <div className={s.body}>
        <div className={s.stats}>
          <div><MetricLabel icon={<Plane />}>Taken in {year}</MetricLabel><div className="stat-value" style={{ fontSize: 20 }}>{taken} <span className="small muted" style={{ fontWeight: 400 }}>days</span></div></div>
          <div><MetricLabel icon={<CalendarClock />}>Booked ahead</MetricLabel><div className="stat-value" style={{ fontSize: 20 }}>{booked} <span className="small muted" style={{ fontWeight: 400 }}>days</span></div></div>
          <div><MetricLabel icon={<Hourglass />}>Awaiting approval</MetricLabel><div className="stat-value" style={{ fontSize: 20 }}>{pending} <span className="small muted" style={{ fontWeight: 400 }}>days</span></div></div>
        </div>

        <div className={s.cols}>
          <section className={s.panel}>
            <div className={s.head}>My requests <span className="faint" style={{ fontWeight: 400 }}>{rows.length || ""}</span></div>
            {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <SkeletonRows rows={4} /> : rows.length === 0 ? (
              <EmptyState compact icon={<Plane size={22} />} title="No leave requests yet" description="Request time off and your manager gets notified." action={<Button size="sm" icon={<Plus size={13} />} onClick={() => setOpen(true)}>Request leave</Button>} />
            ) : rows.map((r) => {
              const st = STATUS[r.status];
              const canCancel = r.status === "PENDING" || (r.status === "APPROVED" && r.from > t0);
              return (
                <div key={r.id} className={s.row}>
                  <span className={s.dates}>{fmtRange(r)}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}><span className="medium">{typeLabel(r.type)}</span>{r.halfDay && <Badge size="sm">Half day</Badge>}</div>
                    {(r.reason || r.reviewNote) && (
                      <div className="tiny faint ellipsis">
                        {r.reason}{r.reason && r.reviewNote ? " · " : ""}{r.reviewNote && <span>{r.reviewedBy?.name ?? "Reviewer"}: “{r.reviewNote}”</span>}
                      </div>
                    )}
                  </span>
                  <span className={s.days}>{r.days} {r.days === 1 ? "day" : "days"}</span>
                  <Badge tone={st.tone} dot>{st.label}</Badge>
                  <span className={s.act}>
                    {canCancel && <Button size="sm" variant="ghost" onClick={() => setCancel(r)}>Cancel</Button>}
                  </span>
                </div>
              );
            })}
          </section>

          <section className={s.panel}>
            <div className={s.head}>Company holidays {year}</div>
            {hol.error ? <ErrorState error={hol.error} /> : !hol.data ? <SkeletonRows rows={3} /> : holidays.length === 0 ? <EmptyState compact title="No holidays set" description="Your admin adds company holidays in settings." /> : holidays.map((h) => (
              <div key={h.id} className={`${s.hol} ${h.date < t0 ? s.past : ""}`}>
                <span className={s.holDate}>{dayName(h.date)}, {fmtDate(h.date)}</span>
                <PartyPopper size={13} color={h.date < t0 ? "var(--text-3)" : "var(--orange)"} />
                <span className="grow ellipsis">{h.name}</span>
                {h.date >= t0 && h.date === holidays.find((x) => x.date >= t0)?.date && <Badge size="sm" tone="orange">Next</Badge>}
                {admin && <IconButton size="sm" variant="ghost" label={`Remove ${h.name}`} icon={<X size={13} />} onClick={() => removeHoliday(h)} />}
              </div>
            ))}
          </section>
        </div>

        {approver && (
          <section className={s.panel}>
            <div className={s.head}>Team leave <span className="faint" style={{ fontWeight: 400 }}>{teamRows.length || ""}</span></div>
            {team.error ? <ErrorState error={team.error} onRetry={team.reload} /> : !team.data ? <SkeletonRows rows={3} /> : teamRows.length === 0 ? (
              <EmptyState compact icon={<Plane size={22} />} title="Nobody has leave coming up" description="Add leave or a holiday for someone and it's approved straight away." action={<Button size="sm" icon={<CalendarPlus size={13} />} onClick={() => setAddOpen(true)}>Add leave or holiday</Button>} />
            ) : teamRows.map((r) => (
              <div key={r.id} className={s.row}>
                <span className={s.dates}>{fmtRange(r)}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}><span className="medium">{r.user?.name}</span><span className="muted">{typeLabel(r.type)}</span>{r.halfDay && <Badge size="sm">Half day</Badge>}</div>
                  {r.reason && <div className="tiny faint ellipsis">{r.reason}</div>}
                </span>
                <span className={s.days}>{r.days} {r.days === 1 ? "day" : "days"}</span>
                <Badge tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Badge>
                <span className={s.act}>
                  <Button size="sm" variant="ghost" onClick={() => setCancel(r)}>Remove</Button>
                </span>
              </div>
            ))}
          </section>
        )}
      </div>

      <RequestLeaveDialog
        forOthers open={addOpen} onClose={() => setAddOpen(false)} workWeek={workWeek} holidays={holidaySet}
        onSaved={() => { team.reload(); hol.reload(); invalidate("/calendar"); }}
      />
      <RequestLeaveDialog open={open} onClose={() => setOpen(false)} onSaved={() => { q.reload(); invalidate("/calendar"); }} workWeek={workWeek} holidays={holidaySet} />
      <ConfirmDialog
        open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} danger loading={busy} confirmLabel="Cancel request"
        title={cancel?.user && cancel.user.id !== me.user.id ? `Remove ${cancel.user.name}'s leave?` : "Cancel this leave request?"}
        description={cancel ? `${typeLabel(cancel.type)}, ${fmtRange(cancel)}.${cancel.user && cancel.user.id !== me.user.id ? "" : " Your manager is no longer asked to approve it."}` : undefined}
      />
    </Page>
  );
}
