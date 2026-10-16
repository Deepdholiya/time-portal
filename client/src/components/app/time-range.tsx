import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { DatePicker, DateRangePicker, IconButton, SegmentedControl } from "@/components/ui";
import { addDays, daysBetween, fmtDate, monthEnd, monthStart, todayIn, weekStart } from "@/lib/format";
import { useMe } from "@/lib/session";

export interface Range { from: string; to: string }
export const RANGE_PRESETS = ["Today", "This week", "Last week", "This month"] as const;
type Preset = (typeof RANGE_PRESETS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Ranges never reach past today, and stay short enough to show day by day. */
export const MAX_RANGE_DAYS = 62;

export function presetRange(name: string, today: string, startsOn = 1): Range {
  const ws = weekStart(today, startsOn);
  switch (name as Preset) {
    case "Today": return { from: today, to: today };
    case "Last week": return { from: addDays(ws, -7), to: addDays(ws, -1) };
    case "This month": return { from: monthStart(today), to: monthEnd(today) > endOfWeek(today, startsOn) ? endOfWeek(today, startsOn) : monthEnd(today) };
    default: return { from: ws, to: addDays(ws, 6) };
  }
}

/** The last day of the week holding `day`: ranges may run to the end of the current week, never further. */
export const endOfWeek = (day: string, startsOn = 1) => addDays(weekStart(day, startsOn), 6);

/** Today in the company's timezone and its week start, which every range in the time module uses. */
export function useCompanyDay() {
  const { me } = useMe();
  const today = todayIn(me.company.timezone), startsOn = me.company.weekStartsOn || 1;
  return { today, startsOn, limit: endOfWeek(today, startsOn) };
}

/**
 * The selected range, kept in the URL (?from=&to=) so it survives reloads and moving between Timesheet and Time tracker.
 * Dates past the end of the current week are clamped to it.
 */
export function useRangeParam(fallback: Preset = "This week") {
  const [params, setParams] = useSearchParams();
  const { today, startsOn, limit } = useCompanyDay();
  const range = useMemo<Range>(() => {
    let from = params.get("from") ?? "", to = params.get("to") ?? "";
    // Older links point at a week (?week=YYYY-MM-DD).
    const week = params.get("week");
    if ((!DATE.test(from) || !DATE.test(to)) && week && DATE.test(week)) { from = weekStart(week, startsOn); to = addDays(from, 6); }
    if (!DATE.test(from) || !DATE.test(to)) return presetRange(fallback, today, startsOn);
    if (from > to) [from, to] = [to, from];
    if (to > limit) to = limit;
    if (from > limit) from = limit;
    if (daysBetween(from, to) >= MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
    return { from, to };
  }, [params, today, startsOn, limit, fallback]);
  const setRange = useCallback((r: Range) => {
    const p = new URLSearchParams(params);
    const def = presetRange(fallback, today, startsOn);
    if (r.from === def.from && r.to === def.to) { p.delete("from"); p.delete("to"); } else { p.set("from", r.from); p.set("to", r.to); }
    p.delete("week");
    setParams(p, { replace: true });
  }, [params, setParams, fallback, today, startsOn]);
  return [range, setRange] as const;
}

/** The range one step earlier or later: whole weeks and months stay whole, anything else moves by its own length. */
function step(r: Range, dir: -1 | 1, limit: string, startsOn: number): Range {
  const n = daysBetween(r.from, r.to) + 1;
  // A single day moves by a day, even on the first day of the week.
  if (n > 1 && r.from === weekStart(r.from, startsOn) && n <= 7) {
    const from = addDays(r.from, 7 * dir);
    return { from, to: addDays(from, 6) > limit ? limit : addDays(from, 6) };
  }
  if (r.from === monthStart(r.from) && (r.to === monthEnd(r.from) || r.to === limit) && n > 7) {
    const from = monthStart(dir < 0 ? addDays(r.from, -1) : addDays(monthEnd(r.from), 1));
    const end = monthEnd(from);
    return { from, to: end > limit ? limit : end };
  }
  const from = addDays(r.from, n * dir);
  const to = addDays(r.to, n * dir);
  return { from, to: to > limit ? limit : to };
}

/**
 * Shared date range control for the time module: single day or range, Today / This week / Last week / This month presets,
 * previous and next, future dates disabled. Weeks start on the company's week start and "today" is the company's today.
 */
export function TimeRangeControl({ value, onChange, rangeOnly }: { value: Range; onChange: (r: Range) => void; rangeOnly?: boolean }) {
  const { today, startsOn, limit } = useCompanyDay();
  const single = !rangeOnly && value.from === value.to;
  const next = step(value, 1, limit, startsOn);
  const atEnd = value.to >= limit;
  const week = presetRange("This week", today, startsOn);
  const label = single ? `${fmtDate(value.from)}${value.from === today ? " (today)" : ""}` : `${fmtDate(value.from)} – ${fmtDate(value.to)}`;
  return (
    <div className="row gap-4" style={{ flexWrap: "wrap" }}>
      {!rangeOnly && (
        <>
          <SegmentedControl<"day" | "range">
            aria-label="Date mode"
            value={single ? "day" : "range"}
            onChange={(m) => onChange(m === "day" ? { from: value.to > today ? today : value.to, to: value.to > today ? today : value.to } : presetRange("This week", value.to, startsOn))}
            options={[{ value: "day", label: "Day" }, { value: "range", label: "Range" }]}
          />
          <span className="range-break" aria-hidden />
        </>
      )}
      <PeriodNav
        unit={single ? "day" : "period"}
        label={label}
        date={value.from}
        max={limit}
        onPick={(v) => { const d = v > limit ? limit : v; onChange({ from: d, to: d }); }}
        picker={single ? undefined : (
          <DateRangePicker
            size="sm"
            value={value}
            max={limit}
            weekStartsOn={startsOn === 7 ? 0 : 1}
            presets={[...RANGE_PRESETS]}
            presetFn={(name) => presetRange(name, today, startsOn)}
            onChange={(r) => onChange({ from: r.from, to: r.to > limit ? limit : r.to })}
          />
        )}
        onPrev={() => onChange(step(value, -1, limit, startsOn))}
        onNext={() => onChange(next)}
        nextDisabled={atEnd}
        onToday={() => onChange(single ? { from: today, to: today } : week)}
        todayLabel={single ? "Today" : "This week"}
        atToday={single ? value.from === today : (value.from === week.from && value.to === week.to)}
      />
    </div>
  );
}

/**
 * The one period selector used across the app: previous, the period itself (click to pick a date on a calendar), next, and a
 * jump back to the current period. Every week, month or day view uses this, in this order.
 */
export function PeriodNav({ label, date, onPick, onPrev, onNext, nextDisabled, max, picker, unit = "period" }: {
  label: ReactNode; date?: string; onPick?: (d: string) => void; onPrev: () => void; onNext: () => void;
  /** No longer drawn: the picker's own presets jump back to today or this week. Kept so callers needn't change. */
  onToday?: () => void; todayLabel?: string; atToday?: boolean; nextDisabled?: boolean; max?: string; picker?: ReactNode; unit?: string;
}) {
  // Drawn like the date range picker's trigger: calendar icon, the period, a chevron.
  const chip = (
    <button type="button" className="tp-date-trigger" aria-label={`Pick a date (${typeof label === "string" ? label : unit})`}>
      <CalendarDays size={16} strokeWidth={1.75} className="tp-date-icon" />
      <span className="num">{label}</span>
      <ChevronDown size={16} strokeWidth={1.75} className="tp-date-chev" />
    </button>
  );
  return (
    <div className="row gap-4 tp-period-nav">
      <IconButton size="sm" variant="secondary" label={`Previous ${unit}`} icon={<ChevronLeft size={14} />} onClick={onPrev} />
      {picker ?? (onPick ? <DatePicker value={date ?? null} max={max} clearable={false} size="sm" onChange={(v) => v && onPick(v)} trigger={chip} /> : chip)}
      <IconButton size="sm" variant="secondary" label={`Next ${unit}`} icon={<ChevronRight size={14} />} disabled={nextDisabled} onClick={onNext} />
    </div>
  );
}
