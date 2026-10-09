import { useMemo } from "react";
import { Clock, Plus } from "lucide-react";
import { Button, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { Page } from "@/components/app/page";
import { useShell } from "@/components/app/shell-context";
import { TimeRangeControl, useCompanyDay, useRangeParam } from "@/components/app/time-range";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { fmtDate, hm, range as days } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { EntryList } from "./entry-list";
import { QuickEntry } from "./quick-entry";
import { expectedMinutes, useDays, useHolidays, useOptions } from "./time-utils";
import s from "./time.module.css";

/** Manual time logging: an entry bar, a summary for the selected range and the entries grouped by day. */
export default function TimeTracker() {
  const { me } = useMe();
  const shell = useShell();
  const { today } = useCompanyDay();
  const [range, setRange] = useRangeParam("This week");
  const q = useApi<TimeEntry[]>("/time", { from: range.from, to: range.to });
  const dayStates = useDays(range.from, range.to);
  const holidays = useHolidays();
  const { data: options } = useOptions();
  const reload = () => { q.reload(); dayStates.reload(); };

  const entries = q.data ?? [];
  const total = entries.reduce((a, e) => a + e.minutes, 0);
  const billable = entries.reduce((a, e) => a + (e.billable ? e.minutes : 0), 0);
  const expected = useMemo(
    () => expectedMinutes(days(range.from, range.to), me.company.workWeek, me.user.weeklyCapacity, new Set((holidays.data ?? []).map((h) => h.date))),
    [range.from, range.to, me.company.workWeek, me.user.weeklyCapacity, holidays.data],
  );
  const byProject = useMemo(() => {
    const m = new Map<string, { name: string; color: string; minutes: number }>();
    for (const e of entries) {
      const top = e.project?.parent ?? e.project;
      const k = String(top?.id);
      const g = m.get(k) ?? { name: top?.name ?? "", color: top?.color ?? "", minutes: 0 };
      g.minutes += e.minutes;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 4);
  }, [entries]);
  const maxProj = byProject[0]?.minutes ?? 1;
  const pct = expected ? Math.min(1, total / expected) : 0;
  const single = range.from === range.to;
  const logFirst = () => shell.logTime({ date: range.to }, reload);

  return (
    <Page
      title="Time tracker"
      icon={<Clock size={15} className="faint" />}
      actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => shell.logTime({ date: range.to <= today ? range.to : today }, reload)}>Log time manually</Button>}
      toolbar={<TimeRangeControl value={range} onChange={setRange} />}
    >
      <QuickEntry options={options} onAdded={reload} />

      <div className={s.summary}>
        <div>
          <div className={s.sumLabel}>{single ? "Day total" : "Range total"}</div>
          <div className={s.sumValue}>{hm(total)}</div>
          <div className="tiny faint">{single ? fmtDate(range.from) : `${fmtDate(range.from)} – ${fmtDate(range.to)}`}</div>
        </div>
        <div>
          <div className={s.sumLabel}>Logged vs expected</div>
          <div className={s.sumValue}>{hm(total)} <span className={s.sumOf}>/ {hm(expected)}</span></div>
          <div className={s.capBar} role="meter" aria-valuemin={0} aria-valuemax={expected} aria-valuenow={total} aria-label="Logged against expected hours"><span style={{ width: `${pct * 100}%`, background: total > expected && expected ? "var(--orange)" : undefined }} /></div>
        </div>
        <div>
          <div className={s.sumLabel}>Billable</div>
          <div className={s.sumValue}>{hm(billable)}</div>
          {total > 0 && <div className="tiny faint">{Math.round((billable / total) * 100)}% of logged time</div>}
        </div>
        <div>
          <div className={s.sumLabel} style={{ marginBottom: 6 }}>By project</div>
          {byProject.length === 0 && <div className="small faint">Nothing logged in this range.</div>}
          <div className={s.projBars}>
            {byProject.map((p) => (
              <div key={p.name} className={s.projBar}>
                <span className="ellipsis">{p.name}</span>
                <span className={s.projTrack}><span style={{ width: `${(p.minutes / maxProj) * 100}%`, background: p.color }} /></span>
                <span className="num right muted">{hm(p.minutes)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={s.list}>
        {q.error ? <ErrorState error={q.error} onRetry={q.reload} />
          : !q.data ? <SkeletonRows rows={8} />
          : entries.length === 0 ? (
            <EmptyState
              icon={<Clock size={26} />}
              title={single ? `No time logged ${range.from === today ? "today" : `on ${fmtDate(range.from)}`}` : "No time logged in this range"}
              description="Add what you worked on with the bar above, or open the full entry form."
              action={<Button variant="primary" icon={<Plus size={14} />} onClick={logFirst}>Log your first entry</Button>}
            />
          ) : (
            <>
              <EntryList entries={entries} days={dayStates.byDate} options={options} onChanged={reload} />
              <div className={s.rangeFoot}><span>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span><span className="grow" /><span className="muted">Total</span><span className="num strong">{hm(total)}</span></div>
            </>
          )}
      </div>
    </Page>
  );
}
