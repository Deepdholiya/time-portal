import { useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Plus, Sheet as SheetIcon } from "lucide-react";
import { Avatar, Button, Combobox, ErrorState, Input, SkeletonRows, Tabs } from "@/components/ui";
import { Page } from "@/components/app/page";
import { useShell } from "@/components/app/shell-context";
import { TimeRangeControl, useCompanyDay, useRangeParam } from "@/components/app/time-range";
import { useSearchParams } from "react-router-dom";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { hm, range as daysOf } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { afterTimeChange, expectedMinutes, useDayLock, useDays, useHolidays, useOptions } from "../time/time-utils";
import { TimesheetGrid, type GridCtx } from "./grid";
import { buildRows, draftRow, type Row } from "./rows";
import { CalendarView } from "../calendar/calendar";
import s from "./timesheet.module.css";

/** Timesheet with two views of the same time: the table and the calendar. The person picked carries across both. */
export default function Timesheet() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "calendar" ? "calendar" : "table";
  const pick = (v: string) => {
    const p = new URLSearchParams(params);
    if (v === "calendar") p.set("view", "calendar"); else p.delete("view");
    p.delete("cal");
    setParams(p, { replace: true });
  };
  const tabs = <Tabs value={view} onChange={pick} items={[{ value: "table", label: "Table" }, { value: "calendar", label: "Calendar" }]} />;
  return view === "calendar" ? <CalendarView tabs={tabs} /> : <TableView tabs={tabs} />;
}

/**
 * Spreadsheet view of the same time entries the Time tracker shows: rows are project + task, columns are days.
 * Click a cell to log or edit time in one step. Days are submitted automatically at the company's cutoff and stay editable.
 */
function TableView({ tabs }: { tabs: ReactNode }) {
  const { me, can } = useMe();
  const shell = useShell();
  const { today } = useCompanyDay();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useRangeParam("This week");
  const viewAll = can("timesheetsView", "all");
  const userId = viewAll && params.get("user") && params.get("user") !== "all" ? Number(params.get("user")) : me.user.id; // "all" is the calendar's everyone view
  const forOther = userId !== me.user.id;
  const days = useMemo(() => daysOf(range.from, range.to), [range.from, range.to]);

  const q = useApi<TimeEntry[]>("/time", { ...range, userId: forOther ? userId : undefined });
  const dayStates = useDays(range.from, range.to, forOther ? userId : undefined);
  const holidays = useHolidays();
  const { data: options } = useOptions();
  const [drafts, setDrafts] = useState<Record<string, Row[]>>({});
  const [reason, setReason] = useState("");
  const isLocked = useDayLock();

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

  const ctx: GridCtx = {
    days, today, userId, forOther, editable, reason, options, workDays, dayTags, isLocked: (d) => isLocked(dayStates.byDate.get(d)?.status), onChanged: reload,
    onAddDraft: (pick) => {
      const r = draftRow(options, pick.projectId!, pick.taskId);
      if (rows.some((x) => x.key === r.key)) return;
      setDraftList((l) => [...l, r]);
      // Open today's (or the last day's) cell in the new row so time can be entered straight away.
      const col = days.includes(today) ? today : days[days.length - 1];
      setTimeout(() => document.querySelector<HTMLButtonElement>(`button[data-row="${CSS.escape(r.key)}"][data-date="${col}"]`)?.click(), 80);
    },
    onRemoveDraft: (key) => setDraftList((l) => l.filter((r) => r.key !== key)),
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
      tabs={tabs}
      actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => shell.logTime()}>Log time</Button>}
      toolbar={
        <>
          <TimeRangeControl value={range} onChange={setRange} rangeOnly />
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
        <span className="small faint">Click a cell to add or edit time: duration, description and tags. Time is submitted automatically each day at {me.company.settings.autoSubmitTime ?? "23:59"} ({me.company.timezone}) and you can still edit it afterwards.</span>
      </div>
    </Page>
  );
}
