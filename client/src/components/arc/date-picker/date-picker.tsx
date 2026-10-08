import { useState, type ReactElement } from "react";
import { CalendarDays } from "lucide-react";
import { Popover } from "../popover/popover";
import { cx } from "../_lib/floating";
import { Calendar, iso } from "./calendar";
import s from "./date-picker.module.css";

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

export function DatePicker({ value, onChange, placeholder = "Pick a date", size = "md", appearance = "field", clearable = true, highlightOverdue, fullWidth, trigger, disabled, ...rest }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const overdue = highlightOverdue && value && value < iso(new Date());
  const t = trigger ?? (
    <button type="button" disabled={disabled} aria-label={rest["aria-label"] ?? placeholder} className={cx(s.trigger, size === "sm" && s.sm, appearance === "chip" && s.chip, fullWidth && s.full)}>
      <CalendarDays size={14} className="faint" />
      {value ? <span className={cx(overdue && s.overdue)}>{shortDate(value)}</span> : <span className={s.placeholder}>{placeholder}</span>}
    </button>
  );
  return (
    <Popover trigger={t} open={open} onOpenChange={setOpen}>
      {(close) => (
        <div>
          <Calendar value={value} onSelect={(v) => { onChange(v); close(); }} />
          <div className={s.foot}>
            <button type="button" onClick={() => { onChange(iso(new Date())); close(); }}>Today</button>
            {clearable && value && <button type="button" onClick={() => { onChange(null); close(); }}>Clear</button>}
          </div>
        </div>
      )}
    </Popover>
  );
}
