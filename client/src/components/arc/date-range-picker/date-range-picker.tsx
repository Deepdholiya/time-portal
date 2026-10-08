import { useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import { Popover } from "../popover/popover";
import { cx } from "../_lib/floating";
import { Calendar, iso, parse } from "../date-picker/calendar";
import { shortDate } from "../date-picker/date-picker";
import s from "../date-picker/date-picker.module.css";

export interface DateRange { from: string; to: string; preset?: string }
const add = (v: string, n: number) => { const d = parse(v); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (v: string) => add(v, -((parse(v).getDay() + 6) % 7));
const monthStart = (v: string) => v.slice(0, 8) + "01";
const monthEnd = (v: string) => { const d = parse(monthStart(v)); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };

/** Presets from the requirements: daily, weekly, monthly, quarterly, yearly and custom. */
export function presetRange(name: string, today = iso(new Date())): DateRange {
  const t = today;
  switch (name) {
    case "Today": return { from: t, to: t, preset: name };
    case "Yesterday": return { from: add(t, -1), to: add(t, -1), preset: name };
    case "This week": return { from: mondayOf(t), to: add(mondayOf(t), 6), preset: name };
    case "Last week": return { from: add(mondayOf(t), -7), to: add(mondayOf(t), -1), preset: name };
    case "This month": return { from: monthStart(t), to: monthEnd(t), preset: name };
    case "Last month": { const lm = add(monthStart(t), -1); return { from: monthStart(lm), to: lm, preset: name }; }
    case "Last 30 days": return { from: add(t, -29), to: t, preset: name };
    case "This quarter": { const d = parse(t); const q = Math.floor(d.getMonth() / 3); const from = iso(new Date(d.getFullYear(), q * 3, 1)); return { from, to: iso(new Date(d.getFullYear(), q * 3 + 3, 0)), preset: name }; }
    case "Last quarter": { const d = parse(t); const q = Math.floor(d.getMonth() / 3) - 1; return { from: iso(new Date(d.getFullYear(), q * 3, 1)), to: iso(new Date(d.getFullYear(), q * 3 + 3, 0)), preset: name }; }
    case "This year": return { from: t.slice(0, 4) + "-01-01", to: t.slice(0, 4) + "-12-31", preset: name };
    case "Year to date": return { from: t.slice(0, 4) + "-01-01", to: t, preset: name };
    default: return { from: mondayOf(t), to: add(mondayOf(t), 6), preset: "This week" };
  }
}
export const PRESETS = ["Today", "Yesterday", "This week", "Last week", "This month", "Last month", "Last 30 days", "This quarter", "Last quarter", "This year"];

export function DateRangePicker({ value, onChange, presets = PRESETS, size = "md" }: { value: DateRange; onChange: (r: DateRange) => void; presets?: string[]; size?: "sm" | "md" }) {
  const [pending, setPending] = useState<string | null>(null);
  const label = value.preset && value.preset !== "Custom" ? value.preset : value.from === value.to ? shortDate(value.from) : `${shortDate(value.from)} – ${shortDate(value.to)}`;
  return (
    <Popover
      onOpenChange={() => setPending(null)}
      trigger={
        <button type="button" className={cx(s.trigger, size === "sm" && s.sm)} aria-label="Date range">
          <CalendarRange size={14} className="faint" />
          <span>{label}</span>
          {value.preset && value.preset !== "Custom" && <span className="faint small">{value.from === value.to ? shortDate(value.from) : `${shortDate(value.from)} – ${shortDate(value.to)}`}</span>}
          <ChevronDown size={13} className="faint" />
        </button>
      }
    >
      {(close) => (
        <div className={s.rangeWrap}>
          <div className={s.presets}>
            {presets.map((p) => (
              <button key={p} type="button" className={cx(s.preset, value.preset === p && s.on)} onClick={() => { onChange(presetRange(p)); close(); }}>{p}</button>
            ))}
          </div>
          <div>
            <Calendar
              rangeFrom={pending ?? value.from}
              rangeTo={pending ? null : value.to}
              initialMonth={value.to}
              onSelect={(v) => {
                if (!pending) setPending(v);
                else { const [a, b] = v < pending ? [v, pending] : [pending, v]; onChange({ from: a, to: b, preset: "Custom" }); setPending(null); close(); }
              }}
            />
            <div className={s.hint}>{pending ? "Pick the end date" : "Pick a start date, then an end date"}</div>
          </div>
        </div>
      )}
    </Popover>
  );
}
