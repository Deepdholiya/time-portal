import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../_lib/floating";
import s from "./select.module.css";

export interface SelectOption { value: string | number; label: string; disabled?: boolean }
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "size" | "value"> {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: (SelectOption | { group: string; options: SelectOption[] })[];
  placeholder?: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
}

/** Native select, styled. Use Combobox when the list needs search. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ value, onChange, options, placeholder, size = "md", fullWidth = true, className, style, ...rest }, ref) {
  return (
    <span className={cx(s.wrap, fullWidth && s.full)} style={style}>
      <select ref={ref} className={cx(s.select, size === "sm" && s.sm, className)} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o, i) =>
          "group" in o ? (
            <optgroup key={i} label={o.group}>{o.options.map((x) => <option key={x.value} value={x.value} disabled={x.disabled}>{x.label}</option>)}</optgroup>
          ) : (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ),
        )}
      </select>
      <ChevronDown size={14} className={s.chevron} />
    </span>
  );
});
