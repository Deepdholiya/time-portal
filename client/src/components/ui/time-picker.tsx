import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Clock } from "lucide-react";
import { Popover as ArcPopover, PopoverContent } from "../arc/popover/popover";
import { Input } from "./field";
import { cx, ownsField } from "./shared";
import s from "./ui.module.css";

const pad = (n: number) => String(n).padStart(2, "0");
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (v: string) => { const m = TIME.exec(v); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** "14:15" → "2:15 PM", the way times read across the app's pickers. */
export function formatTime(v: string) {
  const m = toMin(v);
  if (m < 0) return v;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? "AM" : "PM"}`;
}

/** Typed time → "HH:MM", or null. Accepts "930", "9:30", "9.30", "9", "2pm", "2:15 p", "14:15", "1415". */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, ":").replace(/m$/, "");
  const m = /^(\d{1,4})(?::(\d{1,2}))?(a|p)?$/.exec(t);
  if (!m) return null;
  let h: number, min: number;
  if (m[2] === undefined && m[1].length > 2) { h = Number(m[1].slice(0, -2)); min = Number(m[1].slice(-2)); }
  else { h = Number(m[1]); min = m[2] === undefined ? 0 : Number(m[2]); }
  if (min > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3] === "p" ? 12 : 0); }
  else if (h > 23) return null;
  return fromMin(h * 60 + min);
}

export interface TimePickerProps {
  /** "HH:MM" in 24-hour time; "" means no time. */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Allow emptying the field (typing nothing commits ""). */
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  size?: "sm" | "md";
  /** Minutes between suggested times. */
  step?: number;
  className?: string;
  "aria-label"?: string;
}

/**
 * A time field that looks like the app's Input and DatePicker trigger. Clicking anywhere on it (or ArrowDown) opens a list
 * of times in `step` minute steps, positioned by the same Arc/Radix popover as the date pickers so it flips and shifts to stay
 * on screen. The field also takes typing ("930", "2pm", "14:15"), parsed on Enter or blur.
 */
export const TimePicker = ownsField(function TimePicker({ value, onChange, placeholder = "Select time", clearable, disabled, invalid, size = "md", step = 15, className, ...rest }: TimePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const uid = useId();
  const optionId = (t: string) => `${uid}-${t.replace(":", "")}`;

  // Every step of the day, plus the current value when it falls between steps, so it is always in the list.
  const times = useMemo(() => {
    const list: string[] = [];
    for (let m = 0; m < 24 * 60; m += step) list.push(fromMin(m));
    if (TIME.test(value) && !list.includes(value)) { list.push(value); list.sort(); }
    return list;
  }, [step, value]);

  const scrollTo = (index: number, center = false) => {
    const list = listRef.current, el = list?.children[index] as HTMLElement | undefined;
    if (!list || !el) return;
    if (center) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
    else if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  };
  /** The step nearest a time, so typing "9:40" highlights 9:45. */
  const nearest = (v: string) => {
    const m = toMin(v);
    if (m < 0) return -1;
    let best = 0;
    times.forEach((t, i) => { if (Math.abs(toMin(t) - m) < Math.abs(toMin(times[best]) - m)) best = i; });
    return best;
  };

  // Opening centres the list on the current value (or 9:00), the way a native picker does. Read through a ref so the
  // callback stays stable and re-renders (hovering, typing) never re-centre the list.
  const openAt = useRef(-1);
  openAt.current = TIME.test(value) ? times.indexOf(value) : nearest("09:00");
  const attachList = useCallback((el: HTMLDivElement | null) => {
    listRef.current = el;
    if (el) requestAnimationFrame(() => scrollTo(openAt.current, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = () => { if (disabled || open) return; setActive(TIME.test(value) ? times.indexOf(value) : -1); setOpen(true); };
  const hide = () => { setOpen(false); setActive(-1); };
  const pick = (v: string) => { setDraft(null); if (v !== value) onChange(v); hide(); };
  /** Typed text becomes a time; nothing (when clearable) clears it; anything unreadable puts the last value back. */
  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (!text) { if (clearable && value) onChange(""); return; }
    const parsed = parseTime(text);
    if (parsed && parsed !== value) onChange(parsed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { show(); return; }
      const start = active >= 0 ? active : Math.max(0, nearest(value));
      const next = active < 0 ? start : Math.min(times.length - 1, Math.max(0, start + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      scrollTo(next);
    } else if (e.key === "Enter") {
      // Enter picks the highlighted time, or reads what was typed. It never submits the form while the list is open.
      if (open || draft !== null) e.preventDefault();
      if (open && active >= 0 && draft === null) pick(times[active]);
      else { commit(); hide(); }
    } else if (e.key === "Escape" && (open || draft !== null)) {
      // Close the list (Radix also handles it) and drop the typing, without letting the sheet behind close too.
      e.stopPropagation();
      setDraft(null);
      hide();
    } else if (e.key === "Tab") hide();
  };

  return (
    <ArcPopover open={open} onOpenChange={(o) => (o ? show() : hide())}>
      <PopoverPrimitive.Anchor virtualRef={inputRef as RefObject<HTMLInputElement>} />
      <Input
        {...rest}
        ref={inputRef}
        size={size}
        className={cx(s.timeInput, className)}
        value={draft ?? (value ? formatTime(value) : "")}
        placeholder={placeholder}
        disabled={disabled}
        invalid={invalid}
        autoComplete="off"
        inputMode="text"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-activedescendant={open && active >= 0 ? optionId(times[active]) : undefined}
        suffix={<Clock size={15} strokeWidth={1.75} aria-hidden="true" />}
        onClick={show}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          if (!open && !disabled) setOpen(true);
          const parsed = parseTime(text);
          const i = parsed ? nearest(parsed) : times.findIndex((t) => formatTime(t).toLowerCase().startsWith(text.trim().toLowerCase()));
          setActive(i);
          if (i >= 0) requestAnimationFrame(() => scrollTo(i, true));
        }}
        onBlur={() => { commit(); hide(); }}
      />
      <PopoverContent
        side="bottom"
        align="start"
        className={cx(s.pop, s.timePop)}
        style={{ width: "var(--radix-popover-trigger-width)" }}
        // Focus stays in the field so typing and the arrow keys keep working while the list is open.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => { if (e.target instanceof Node && inputRef.current?.contains(e.target)) e.preventDefault(); }}
      >
        <div
          ref={attachList}
          className={s.timeList}
          role="listbox"
          aria-label={rest["aria-label"] ?? "Times"}
        >
          {times.map((t, i) => (
            <div
              key={t}
              id={optionId(t)}
              role="option"
              aria-selected={t === value}
              className={cx(s.timeOption, i === active && s.hi, t === value && s.timeSelected)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(t)}
            >
              {formatTime(t)}
            </div>
          ))}
        </div>
      </PopoverContent>
    </ArcPopover>
  );
});
