import { useMemo, useState } from "react";
import { AlertCircle, Send, Sheet as SheetIcon } from "lucide-react";
import { Avatar, Button, Combobox, ErrorState, Input, SkeletonRows } from "@/components/ui";
import { Page } from "@/components/app/page";
import { TimeRangeControl, useCompanyDay, useRangeParam } from "@/components/app/time-range";
import { useSearchParams } from "react-router-dom";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { fmtDate, hm, range as daysOf } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { afterTimeChange, expectedMinutes, useDays, useHolidays, useOptions } from "../time/time-utils";
import { reopenDay, submitDays } from "../time/day-actions";
import { StatusLegend, TimesheetGrid, type GridCtx } from "./grid";
import { buildRows, draftRow, type Row } from "./rows";
import s from "./timesheet.module.css";

/**
 * Spreadsheet view of the same time entries the Time tracker shows: rows are project + task, columns are days.
 * Entries save as soon as a cell is left; each day submits itself at the company's cutoff, or by hand from here.
 */
export default function Timesheet() {
  const { me, can } = useMe();
  const { today } = useCompanyDay();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useRangeParam("This week");
  const viewAll = can("timesheetsView", "all");
  const userId = viewAll && params.get("user") ? Number(params.get("user")) : me.user.id;
  const forOther = userId !== me.user.id;
  const days = useMemo(() => daysOf(range.from, range.to), [range.from, range.to]);

  const q = useApi<TimeEntry[]>("/time", { ...range, userId: forOther ? userId : undefined });
  const dayStates = useDays(range.from, range.to, forOther ? userId : undefined);
  const holidays = useHolidays();
  const { data: options } = useOptions();
  const [drafts, setDrafts] = useState<Record<string, Row[]>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const draftKey = `${userId}:${range.from}:${range.to}`;
  const rangeDrafts = drafts[draftKey] ?? [];
  const rows = useMemo(() => buildRows(q.data ?? [], rangeDrafts, options), [q.data, rangeDrafts, options]);
  const total = (q.data ?? []).reduce((a, e) => a + e.minutes, 0);

  const workDays = useMemo(() => new Set(me.company.workWeek.split(",").map(Number)), [me.company.workWeek]);
  const person = options?.users.find((u) => u.id === userId);
  const holidaySet = useMemo(() => new Set((holidays.data ?? []).map((h) => h.date)), [holidays.data]);
  const weekly = forOther ? me.company.hoursPerDay * workDays.size : me.user.weeklyCapacity;
  const expected = expectedMinutes(days.filter((d) => d <= today), me.company.workWeek, weekly, holidaySet);
  const dayTags = useMemo(() => Object.fromEntries((holidays.data ?? []).filter((h) => h.date >= range.from && h.date <= range.to).map((h) => [h.date, h.name])), [holidays.data, range.from, range.to]);
  const editable = !forOther || can("editOthersTime", "yes");

  const reload = () => { q.reload(); dayStates.reload(); afterTimeChange(); };
  const setDraftList = (fn: (l: Row[]) => Row[]) => setDrafts((d) => ({ ...d, [draftKey]: fn(d[draftKey] ?? []) }));

  const ready = (dayStates.data?.days ?? []).filter((d) => d.entries > 0 && ["SAVED", "FAILED", "REJECTED", "REOPENED"].includes(d.status));
  const problems = (dayStates.data?.days ?? []).filter((d) => ["FAILED", "REJECTED"].includes(d.status));
  const submit = async (dates: string[]) => { setBusy(true); await submitDays(dates); setBusy(false); reload(); };

  const ctx: GridCtx = {
    days, today, userId, forOther, editable, reason, options, workDays, dayTags, dayStates: dayStates.byDate, onChanged: reload,
    onAddDraft: (pick) => {
      const r = draftRow(options, pick.projectId!, pick.taskId);
      if (rows.some((x) => x.key === r.key)) return;
      setDraftList((l) => [...l, r]);
      // Jump to today's (or the last day's) cell in the new row so hours can be typed straight away.
      const col = days.includes(today) ? today : days[days.length - 1];
      setTimeout(() => document.querySelector<HTMLInputElement>(`input[data-row="${CSS.escape(r.key)}"][data-date="${col}"]`)?.focus(), 80);
    },
    onRemoveDraft: (key) => setDraftList((l) => l.filter((r) => r.key !== key)),
    onSubmitDay: (d) => submit([d]),
    onReopenDay: (d) => reopenDay(d).then(reload),
  };

  const pickUser = (v: number | null) => {
    const p = new URLSearchParams(params);
    if (!v || v === me.user.id) p.delete("user"); else p.set("user", String(v));
    setParams(p, { replace: true });
  };
  const userOptions = (options?.users ?? []).map((u) => ({ value: u.id, label: u.id === me.user.id ? `${u.name} (you)` : u.name, icon: <Avatar name={u.name} size={16} />, keywords: u.email }));
  const pct = expected ? Math.min(1, total / expected) : 0;

  return (
    <Page
      title="Timesheet"
      icon={<SheetIcon size={15} className="faint" />}
      actions={!forOther && ready.length > 0 ? (
        <Button size="sm" variant="secondary" icon={<Send size={13} />} loading={busy} onClick={() => submit(ready.map((d) => d.date))}>
          Submit {ready.length === 1 ? fmtDate(ready[0].date) : `${ready.length} days`}
        </Button>
      ) : undefined}
      toolbar={
        <>
          <TimeRangeControl value={range} onChange={setRange} />
          {viewAll && (
            <div style={{ width: 210, marginLeft: 4 }}>
              <Combobox size="sm" options={userOptions} value={userId} onChange={(v) => pickUser(v ? Number(v) : null)} searchPlaceholder="Search people…" aria-label="Employee" />
            </div>
          )}
          <span className="grow" />
          <div className={s.capacity} title="Logged in this range against expected hours (working days up to today)">
            <span className="small muted">{forOther && person ? `${person.name.split(" ")[0]}: ` : "Logged "}<span className="num strong" style={{ color: "var(--text)" }}>{hm(total)}</span> / <span className="num">{hm(expected)}</span> expected</span>
            <span className={s.capBar}><span style={{ width: `${pct * 100}%`, background: total > expected && expected ? "var(--orange)" : undefined }} /></span>
          </div>
        </>
      }
    >
      {problems.map((d) => (
        <div key={d.date} className={`${s.banner} ${d.status === "REJECTED" ? s.red : s.orange}`} role="status">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div className="grow">
            <span className="medium">{fmtDate(d.date)} {d.status === "REJECTED" ? `was sent back${d.reviewedBy ? ` by ${d.reviewedBy.name}` : ""}` : "couldn't be submitted automatically"}.</span>{" "}
            {d.note && <>{d.status === "REJECTED" ? `“${d.note}”` : d.note}. </>}
            <span style={{ opacity: 0.85 }}>{forOther ? "" : "Fix the entries, then submit the day again."}</span>
          </div>
          {!forOther && <Button size="sm" variant="ghost" onClick={() => submit([d.date])}>Submit again</Button>}
        </div>
      ))}
      {forOther && editable && (
        <div className={`${s.banner} ${s.yellow}`}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 7, color: "var(--yellow)" }} />
          <div className="row grow wrap" style={{ gap: 10 }}>
            <span>You're editing {person?.name ?? "this person"}'s timesheet. Every change is recorded in the audit log with your reason.</span>
            <Input size="sm" style={{ flex: 1, minWidth: 220 }} placeholder="Reason for changes (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for changes" />
          </div>
        </div>
      )}

      <div className={s.wrap}>
        {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <SkeletonRows rows={6} /> : <TimesheetGrid rows={rows} ctx={ctx} />}
      </div>
      <div className={s.foot}>
        <StatusLegend />
        <span className="small faint">Type hours in a cell (2, 1.5, 1h 30m or 45m) and they save when you leave it. Days submit themselves at {me.company.settings.autoSubmitTime ?? "23:59"} ({me.company.timezone}).</span>
      </div>
    </Page>
  );
}
