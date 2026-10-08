import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Copy, Lock, Send, Sheet as SheetIcon, Undo2 } from "lucide-react";
import { Avatar, Badge, Button, Combobox, ConfirmDialog, DatePicker, ErrorState, IconButton, Input, SkeletonRows, toast, type BadgeTone } from "@/components/ui";
import { Page } from "@/components/app/page";
import { useRunningTimer } from "@/components/app/timer-widget";
import { post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { addDays, fmtDate, hm, range, today, weekStart } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { useOptions } from "../time/time-utils";
import { TimesheetGrid, type GridCtx } from "./grid";
import { buildRows, draftRow, type Row } from "./rows";
import s from "./timesheet.module.css";

interface Period { id: number; status: "SUBMITTED" | "APPROVED" | "REJECTED"; note?: string | null; submittedAt?: string | null; reviewedAt?: string | null; reviewedBy?: { name: string } | null }
interface Holiday { id: number; date: string; name: string }

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draft", tone: "gray" }, SUBMITTED: { label: "Submitted", tone: "blue" }, APPROVED: { label: "Approved", tone: "green" }, REJECTED: { label: "Changes requested", tone: "red" },
};

export default function Timesheet() {
  const { me, can } = useMe();
  const [params, setParams] = useSearchParams();
  const startsOn = me.company.weekStartsOn || 1;
  const week = weekStart(params.get("week") || today(), startsOn);
  const viewAll = can("timesheetsView", "all");
  const userId = viewAll && params.get("user") ? Number(params.get("user")) : me.user.id;
  const forOther = userId !== me.user.id;
  const days = useMemo(() => range(week, addDays(week, 6)), [week]);

  const q = useApi<TimeEntry[]>("/time", { from: week, to: addDays(week, 6), userId: forOther ? userId : undefined });
  const period = useApi<Period | null>("/timesheets", { weekStart: week, userId: forOther ? userId : undefined });
  const holidays = useApi<Holiday[]>("/settings/holidays");
  const { data: options } = useOptions();
  const { data: running } = useRunningTimer();
  const [drafts, setDrafts] = useState<Record<string, Row[]>>({});
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<null | "submit" | "withdraw" | "copy">(null);
  const [busy, setBusy] = useState(false);

  const draftKey = `${userId}:${week}`;
  const weekDrafts = drafts[draftKey] ?? [];
  const rows = useMemo(() => buildRows(q.data ?? [], weekDrafts, options), [q.data, weekDrafts, options]);
  const total = (q.data ?? []).reduce((a, e) => a + e.minutes, 0);

  const workDays = useMemo(() => new Set(me.company.workWeek.split(",").map(Number)), [me.company.workWeek]);
  const person = options?.users.find((u) => u.id === userId);
  const capacity = forOther ? me.company.hoursPerDay * workDays.size * 60 : me.user.weeklyCapacity * 60;
  const dayTags = useMemo(() => Object.fromEntries((holidays.data ?? []).filter((h) => h.date >= week && h.date <= addDays(week, 6)).map((h) => [h.date, h.name])), [holidays.data, week]);

  const status = period.data?.status ?? "DRAFT";
  const locked = status === "SUBMITTED" || status === "APPROVED";
  const editable = !locked && (!forOther || can("editOthersTime", "yes"));

  const reload = useCallback(() => { invalidate("/time?"); invalidate("/analytics"); invalidate("/calendar"); }, []);
  const setDraftList = (fn: (l: Row[]) => Row[]) => setDrafts((d) => ({ ...d, [draftKey]: fn(d[draftKey] ?? []) }));

  const ctx: GridCtx = {
    days, userId, forOther, editable, reason, options, workDays, dayTags, onChanged: reload,
    onAddDraft: (pick) => {
      const r = draftRow(options, pick.projectId!, pick.taskId);
      setDraftList((l) => [...l, r]);
      // Focus the new row's description so the user can type straight away.
      setTimeout(() => document.querySelector<HTMLInputElement>(`[data-row-desc="${CSS.escape(r.key)}"]`)?.focus(), 60);
    },
    onUpdateDraft: (key, patch) => setDraftList((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r))),
    onRemoveDraft: (key) => setDraftList((l) => l.filter((r) => r.key !== key)),
  };

  const go = (w: string | null, user?: number | null) => {
    const p = new URLSearchParams(params);
    if (w !== null) { if (w === weekStart(today(), startsOn)) p.delete("week"); else p.set("week", w); }
    if (user !== undefined) { if (!user || user === me.user.id) p.delete("user"); else p.set("user", String(user)); }
    setParams(p, { replace: true });
  };

  const act = async (kind: "submit" | "withdraw" | "copy") => {
    setBusy(true);
    try {
      if (kind === "submit") {
        await post("/timesheets/submit", { weekStart: week });
        toast.success("Week submitted for approval", { description: "Your manager has been notified." });
      } else if (kind === "withdraw") {
        await post("/timesheets/withdraw", { weekStart: week });
        toast.success("Submission withdrawn", { description: "You can edit the week again." });
      } else {
        const r = await post<{ created: number; skipped: number }>("/time/copy", { pairs: days.map((d) => [addDays(d, -7), d]), ...(forOther ? { userId } : {}) });
        if (r.created) toast.success(`Copied ${r.created} ${r.created === 1 ? "entry" : "entries"} from last week`, { description: r.skipped ? `${r.skipped} skipped (project no longer available)` : undefined });
        else toast.info("Nothing to copy", { description: "Last week has no entries." });
        reload();
      }
      period.reload();
      invalidate("/timesheets");
      setConfirm(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const userOptions = (options?.users ?? []).map((u) => ({ value: u.id, label: u.id === me.user.id ? `${u.name} (you)` : u.name, icon: <Avatar name={u.name} size={16} />, keywords: u.email }));
  const isThisWeek = week === weekStart(today(), startsOn);
  const st = STATUS[status];
  const pct = capacity ? Math.min(1, total / capacity) : 0;

  return (
    <Page
      title="Timesheet"
      icon={<SheetIcon size={15} className="faint" />}
      actions={
        <div className="row gap-4">
          {!forOther && (status === "DRAFT" || status === "REJECTED") && (
            <Button size="sm" variant="primary" icon={<Send size={13} />} onClick={() => setConfirm("submit")} disabled={!q.data || total === 0}>{status === "REJECTED" ? "Resubmit week" : "Submit week"}</Button>
          )}
          {!forOther && status === "SUBMITTED" && <Button size="sm" icon={<Undo2 size={13} />} onClick={() => setConfirm("withdraw")}>Withdraw</Button>}
        </div>
      }
      toolbar={
        <>
          <IconButton size="sm" variant="secondary" label="Previous week" icon={<ChevronLeft size={14} />} onClick={() => go(addDays(week, -7))} />
          <DatePicker
            value={week}
            onChange={(v) => v && go(weekStart(v, startsOn))}
            clearable={false}
            size="sm"
            trigger={<button type="button" className={`prop-chip ${s.weekLabel}`} aria-label="Pick a week">{fmtDate(week)} – {fmtDate(addDays(week, 6), true)}</button>}
          />
          <IconButton size="sm" variant="secondary" label="Next week" icon={<ChevronRight size={14} />} onClick={() => go(addDays(week, 7))} />
          {!isThisWeek && <Button size="sm" variant="ghost" onClick={() => go(weekStart(today(), startsOn))}>This week</Button>}
          <Badge tone={st.tone} dot>{st.label}</Badge>
          {viewAll && (
            <div style={{ width: 210, marginLeft: 8 }}>
              <Combobox size="sm" options={userOptions} value={userId} onChange={(v) => go(null, v ? Number(v) : null)} searchPlaceholder="Search people…" aria-label="Employee" />
            </div>
          )}
          <span className="grow" />
          {editable && <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => setConfirm("copy")}>Copy last week</Button>}
          <div className={s.capacity} title="Logged this week against weekly capacity">
            <span className="small muted">{forOther && person ? `${person.name.split(" ")[0]}: ` : ""}<span className="num strong" style={{ color: "var(--text)" }}>{hm(total)}</span> / {hm(capacity)}</span>
            <span className={s.capBar}><span style={{ width: `${pct * 100}%`, background: total > capacity ? "var(--orange)" : undefined }} /></span>
          </div>
        </>
      }
    >
      {status === "REJECTED" && (
        <div className={`${s.banner} ${s.red}`} role="status">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div><span className="medium">{period.data?.reviewedBy?.name ?? "Your manager"} sent this week back.</span> {period.data?.note && <>“{period.data.note}”</>} <span style={{ opacity: 0.85 }}>Fix the entries and resubmit.</span></div>
        </div>
      )}
      {status === "SUBMITTED" && (
        <div className={`${s.banner} ${s.blue}`} role="status">
          <Lock size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>Submitted{period.data?.submittedAt ? ` on ${fmtDate(period.data.submittedAt.slice(0, 10))}` : ""} and waiting for approval. {forOther ? "" : "Withdraw it to make changes."}</div>
        </div>
      )}
      {status === "APPROVED" && (
        <div className={`${s.banner} ${s.green}`} role="status">
          <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>Approved{period.data?.reviewedBy ? ` by ${period.data.reviewedBy.name}` : ""}{period.data?.reviewedAt ? ` on ${fmtDate(period.data.reviewedAt.slice(0, 10))}` : ""}. This week is locked; an admin can unlock it with a reason.</div>
        </div>
      )}
      {forOther && editable && (
        <div className={`${s.banner} ${s.yellow}`}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 7, color: "var(--yellow)" }} />
          <div className="row grow wrap" style={{ gap: 10 }}>
            <span>You're editing {person?.name ?? "this person"}'s timesheet. Every change is recorded in the audit log with your reason.</span>
            <Input size="sm" style={{ flex: 1, minWidth: 220 }} placeholder="Reason for changes (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for changes" />
          </div>
        </div>
      )}
      {running && !forOther && running.date >= week && running.date <= addDays(week, 6) && (
        <div className={`${s.banner} ${s.yellow}`}><AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: "var(--yellow)" }} /><div>A timer is running. Its time appears here once you stop it.</div></div>
      )}

      <div className={s.wrap}>
        {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <SkeletonRows rows={6} /> : <TimesheetGrid rows={rows} ctx={ctx} />}
      </div>

      <ConfirmDialog
        open={confirm === "submit"} onClose={() => setConfirm(null)} onConfirm={() => act("submit")} loading={busy} confirmLabel="Submit"
        title={`Submit the week of ${fmtDate(week)}?`}
        description={`${hm(total)} logged against ${hm(capacity)} capacity. The week is locked while your manager reviews it.`}
      />
      <ConfirmDialog
        open={confirm === "withdraw"} onClose={() => setConfirm(null)} onConfirm={() => act("withdraw")} loading={busy} confirmLabel="Withdraw"
        title="Withdraw this submission?" description="The week goes back to draft so you can edit it. You'll need to submit it again."
      />
      <ConfirmDialog
        open={confirm === "copy"} onClose={() => setConfirm(null)} onConfirm={() => act("copy")} loading={busy} confirmLabel="Copy entries"
        title="Copy last week into this week?" description={`Every entry from ${fmtDate(addDays(week, -7))} – ${fmtDate(addDays(week, -1))} is added to the same weekday this week, without clock times. Existing entries stay.`}
      />
    </Page>
  );
}
