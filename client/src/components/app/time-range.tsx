import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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
    case "This month": return { from: monthStart(today), to: today };
    default: return { from: ws, to: today };
  }
}

/** Today in the company's timezone and its week start, which every range in the time module uses. */
export function useCompanyDay() {
  const { me } = useMe();
  return { today: todayIn(me.company.timezone), startsOn: me.company.weekStartsOn || 1 };
}

/**
 * The selected range, kept in the URL (?from=&to=) so it survives reloads and moving between Timesheet and Time tracker.
 * Future dates are clamped to today.
 */
export function useRangeParam(fallback: Preset = "This week") {
  const [params, setParams] = useSearchParams();
  const { today, startsOn } = useCompanyDay();
  const range = useMemo<Range>(() => {
    let from = params.get("from") ?? "", to = params.get("to") ?? "";
    // Older links point at a week (?week=YYYY-MM-DD).
    const week = params.get("week");
    if ((!DATE.test(from) || !DATE.test(to)) && week && DATE.test(week)) { from = weekStart(week, startsOn); to = addDays(from, 6); }
    if (!DATE.test(from) || !DATE.test(to)) return presetRange(fallback, today, startsOn);
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    if (from > today) from = today;
    if (daysBetween(from, to) >= MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
    return { from, to };
  }, [params, today, startsOn, fallback]);
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
function step(r: Range, dir: -1 | 1, today: string, startsOn: number): Range {
  const n = daysBetween(r.from, r.to) + 1;
  if (r.from === weekStart(r.from, startsOn) && n <= 7) {
    const from = addDays(r.from, 7 * dir);
    return { from, to: addDays(from, 6) > today ? today : addDays(from, 6) };
  }
  if (r.from === monthStart(r.from) && (r.to === monthEnd(r.from) || r.to === today) && n > 7) {
    const from = monthStart(dir < 0 ? addDays(r.from, -1) : addDays(monthEnd(r.from), 1));
    const end = monthEnd(from);
    return { from, to: end > today ? today : end };
  }
  const from = addDays(r.from, n * dir);
  const to = addDays(r.to, n * dir);
  return { from, to: to > today ? today : to };
}

/**
 * Shared date range control for the time module: single day or range, Today / This week / Last week / This month presets,
 * previous and next, future dates disabled. Weeks start on the company's week start and "today" is the company's today.
 */
export function TimeRangeControl({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const { today, startsOn } = useCompanyDay();
  const single = value.from === value.to;
  const next = step(value, 1, today, startsOn);
  const atEnd = value.to >= today;
  const label = single ? `${fmtDate(value.from)}${value.from === today ? " (today)" : ""}` : `${fmtDate(value.from)} – ${fmtDate(value.to)}`;
  return (
    <div className="row gap-4" style={{ flexWrap: "wrap" }}>
      <SegmentedControl<"day" | "range">
        aria-label="Date mode"
        value={single ? "day" : "range"}
        onChange={(m) => onChange(m === "day" ? { from: value.to, to: value.to } : presetRange("This week", value.to, startsOn))}
        options={[{ value: "day", label: "Day" }, { value: "range", label: "Range" }]}
      />
      <IconButton size="sm" variant="secondary" label={single ? "Previous day" : "Previous period"} icon={<ChevronLeft size={14} />} onClick={() => onChange(step(value, -1, today, startsOn))} />
      {single ? (
        <DatePicker
          value={value.from}
          max={today}
          clearable={false}
          size="sm"
          onChange={(v) => v && onChange({ from: v > today ? today : v, to: v > today ? today : v })}
          trigger={<button type="button" className="prop-chip num" aria-label="Pick a day" style={{ minWidth: 120, justifyContent: "center" }}><CalendarDays size={13} className="faint" />{label}</button>}
        />
      ) : (
        <DateRangePicker
          size="sm"
          value={value}
          max={today}
          weekStartsOn={startsOn === 7 ? 0 : 1}
          presets={[...RANGE_PRESETS]}
          presetFn={(name) => presetRange(name, today, startsOn)}
          onChange={(r) => onChange({ from: r.from, to: r.to > today ? today : r.to })}
        />
      )}
      <IconButton size="sm" variant="secondary" label={single ? "Next day" : "Next period"} icon={<ChevronRight size={14} />} disabled={atEnd} onClick={() => onChange(next)} />
    </div>
  );
}
