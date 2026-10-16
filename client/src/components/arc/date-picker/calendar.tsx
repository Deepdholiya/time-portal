import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../_lib/floating";
import s from "./date-picker.module.css";

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Month grid. Weeks start on Monday. */
export function Calendar({ value, onSelect, rangeFrom, rangeTo, initialMonth }: { value?: string | null; onSelect: (v: string) => void; rangeFrom?: string | null; rangeTo?: string | null; initialMonth?: string | null }) {
  const start = parse(initialMonth ?? value ?? rangeFrom ?? iso(new Date()));
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const todayIso = iso(new Date());
  return (
    <div className={s.cal}>
      <div className={s.head}>
        <button type="button" className={s.nav} aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
        <span>{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <button type="button" className={s.nav} aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
      </div>
      <div className={s.grid}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <div key={d} className={s.dow}>{d}</div>)}
        {days.map((d) => {
          const v = iso(d);
          const sel = v === value || v === rangeFrom || v === rangeTo;
          const inRange = !!rangeFrom && !!rangeTo && v > rangeFrom && v < rangeTo;
          return (
            <button
              type="button" key={v} aria-label={v} aria-pressed={sel}
              className={cx(s.day, d.getMonth() !== month.getMonth() && s.out, v === todayIso && s.today, sel && s.sel, inRange && s.inRange, (d.getDay() === 0 || d.getDay() === 6) && s.weekend)}
              onClick={() => onSelect(v)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
