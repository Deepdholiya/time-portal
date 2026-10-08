import { useState, type ReactElement } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "../arc/calendar/calendar";
import { DatePicker as ArcDatePicker } from "../arc/date-picker/date-picker";
import { DateRangePicker as ArcDateRangePicker, type DateRangePreset } from "../arc/date-range-picker/date-range-picker";
import { Popover } from "./popover";
import { controlLabel, cx, ownsField, useField } from "./shared";
import s from "./ui.module.css";

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (v: string) => { const [y, m, d] = v.split("-").map(Number); return `${MONTHS[m - 1]} ${d}${y !== new Date().getFullYear() ? `, ${y}` : ""}`; };

export interface DatePickerProps {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  size?: "sm" | "md";
  appearance?: "field" | "chip";
  clearable?: boolean;
  /** Highlight past dates in red (due dates). */
  highlightOverdue?: boolean;
  fullWidth?: boolean;
  trigger?: ReactElement;
  disabled?: boolean;
  "aria-label"?: string;
}

/** Form fields use Arc DatePicker. Property chips and custom triggers open Arc's Calendar in an Arc Popover. Values are ISO dates. */
export const DatePicker = ownsField(function DatePicker({ value, onChange, placeholder = "Pick a date", size = "md", appearance = "field", clearable = true, highlightOverdue, fullWidth, trigger, disabled, ...rest }: DatePickerProps) {
  const field = useField();
  const [open, setOpen] = useState(false);
  if (appearance === "field" && !trigger) {
    const { label, hidden } = controlLabel(field, rest["aria-label"] ?? placeholder);
    return (
      <div className={cx(hidden && s.srLabel, size === "sm" && s.sm, s.inputWrap, !fullWidth && !field && s.inline)}>
        <ArcDatePicker
          label={label}
          value={value ? parse(value) : undefined}
          onChange={(d) => { if (d) onChange(iso(d)); else if (clearable) onChange(null); }}
          placeholder={placeholder}
          description={field?.error ?? field?.description}
          disabled={disabled}
          showToday
        />
      </div>
    );
  }
  const overdue = highlightOverdue && value && value < iso(new Date());
  const t = trigger ?? (
    <button type="button" disabled={disabled} aria-label={rest["aria-label"] ?? placeholder} className={cx(s.chip, s.ghost, size === "sm" && s.sm, fullWidth && s.full)}>
      <CalendarDays size={14} className="faint" />
      {value ? <span className={cx(overdue && s.overdue)}>{shortDate(value)}</span> : <span className={s.placeholder}>{placeholder}</span>}
    </button>
  );
  return (
    <Popover trigger={t} open={open} onOpenChange={setOpen} padded={false}>
      {(close) => (
        <div className={s.calendarPop}>
          <Calendar value={value ? parse(value) : undefined} onChange={(d) => { onChange(iso(d)); close(); }} showToday />
          <div className={s.calendarFoot}>
            <button type="button" className="link small" style={{ background: "none", border: 0 }} onClick={() => { onChange(iso(new Date())); close(); }}>Today</button>
            {clearable && value && <button type="button" className="link small" style={{ background: "none", border: 0 }} onClick={() => { onChange(null); close(); }}>Clear</button>}
          </div>
        </div>
      )}
    </Popover>
  );
});

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

/** Arc DateRangePicker with the app's named presets. Ranges travel as ISO dates and remember which preset produced them. */
export function DateRangePicker({ value, onChange, presets = PRESETS, size = "md" }: { value: DateRange; onChange: (r: DateRange) => void; presets?: string[]; size?: "sm" | "md" }) {
  const arcPresets: DateRangePreset[] = presets.map((name) => ({ label: name, range: (today) => { const r = presetRange(name, iso(today)); return { start: parse(r.from), end: parse(r.to) }; } }));
  return (
    <div className={cx(size === "sm" && s.sm, s.inline)}>
      <ArcDateRangePicker
        value={{ start: parse(value.from), end: parse(value.to) }}
        presets={arcPresets}
        weekStartsOn={1}
        onChange={(r) => {
          const from = iso(r.start), to = iso(r.end);
          const match = presets.find((p) => { const x = presetRange(p); return x.from === from && x.to === to; });
          onChange({ from, to, preset: match ?? "Custom" });
        }}
      />
    </div>
  );
}
