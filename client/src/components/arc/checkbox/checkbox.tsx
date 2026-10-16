import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cx } from "../_lib/floating";
import s from "./checkbox.module.css";

export function Checkbox({ checked, onChange, label, disabled, indeterminate, "aria-label": ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; indeterminate?: boolean; "aria-label"?: string }) {
  return (
    <label className={cx(s.label, disabled && s.disabled)} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" className={s.input} checked={checked} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.checked)} />
      <span className={cx(s.box, (checked || indeterminate) && s.on)}>{indeterminate ? <Minus size={10} strokeWidth={3} /> : checked && <Check size={10} strokeWidth={3} />}</span>
      {label}
    </label>
  );
}
