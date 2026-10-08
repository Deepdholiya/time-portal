import { useMemo, useState } from "react";
import { PartyPopper, Plane, Plus } from "lucide-react";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, SkeletonRows, toast, type BadgeTone } from "@/components/arc";
import { Page } from "@/components/app/page";
import { post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { dayName, fmtDate, today } from "@/lib/format";
import { LEAVE_TYPES, RequestLeaveDialog } from "./request-dialog";
import s from "./leave.module.css";

interface LeaveRequest { id: number; type: string; from: string; to: string; halfDay: boolean; reason?: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; reviewNote?: string | null; reviewedBy?: { name: string } | null; days: number }
interface Holiday { id: number; date: string; name: string }

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pending", tone: "yellow" }, APPROVED: { label: "Approved", tone: "green" }, REJECTED: { label: "Declined", tone: "red" }, CANCELLED: { label: "Cancelled", tone: "gray" },
};
const typeLabel = (t: string) => LEAVE_TYPES.find((x) => x.value === t)?.label ?? t;

export default function Leave() {
  const { me } = useMe();
  const q = useApi<LeaveRequest[]>("/leave");
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
      invalidate("/calendar");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const fmtRange = (r: LeaveRequest) => (r.from === r.to ? `${dayName(r.from)}, ${fmtDate(r.from)}` : `${fmtDate(r.from)} – ${fmtDate(r.to)}`);

  return (
    <Page title="Leave" icon={<Plane size={15} className="faint" />} actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(true)}>Request leave</Button>}>
      <div className={s.body}>
        <div className={s.stats}>
          <div><div className="stat-label">Taken in {year}</div><div className="stat-value" style={{ fontSize: 20 }}>{taken} <span className="small muted" style={{ fontWeight: 400 }}>days</span></div></div>
          <div><div className="stat-label">Booked ahead</div><div className="stat-value" style={{ fontSize: 20 }}>{booked} <span className="small muted" style={{ fontWeight: 400 }}>days</span></div></div>
          <div><div className="stat-label">Awaiting approval</div><div className="stat-value" style={{ fontSize: 20 }}>{pending} <span className="small muted" style={{ fontWeight: 400 }}>days</span></div></div>
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
                  <span style={{ width: 64, display: "flex", justifyContent: "flex-end" }}>
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
              </div>
            ))}
          </section>
        </div>
      </div>

      <RequestLeaveDialog open={open} onClose={() => setOpen(false)} onSaved={() => { q.reload(); invalidate("/calendar"); }} workWeek={workWeek} holidays={holidaySet} />
      <ConfirmDialog
        open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} danger loading={busy} confirmLabel="Cancel request"
        title="Cancel this leave request?" description={cancel ? `${typeLabel(cancel.type)}, ${fmtRange(cancel)}. Your manager is no longer asked to approve it.` : undefined}
      />
    </Page>
  );
}
