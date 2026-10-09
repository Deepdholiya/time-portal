import { type CSSProperties } from "react";
import { Select as ArcSelect } from "../arc/select/select";
import { controlLabel, cx, ownsField, useField } from "./shared";
import s from "./ui.module.css";

export interface SelectOption { value: string | number; label: string; disabled?: boolean }
export interface SelectProps {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: (SelectOption | { group: string; options: SelectOption[] })[];
  /** Adds an empty choice with this label (value ""). */
  placeholder?: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  title?: string;
}

/** Radix forbids an empty item value, so the "none" choice travels under this key. */
const NONE = "__none__";

/** Arc Select. Option groups are flattened, since Arc's select lists a single level. */
export const Select = ownsField(function Select({ value, onChange, options, placeholder, size = "md", fullWidth = true, disabled, name, className, style, title, "aria-label": ariaLabel }: SelectProps) {
  const field = useField();
  const { label, hidden } = controlLabel(field, ariaLabel ?? placeholder);
  const flat = options.flatMap((o) => ("group" in o ? o.options : [o])).map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled }));
  const items = placeholder !== undefined ? [{ value: NONE, label: placeholder }, ...flat] : flat;
  const current = value == null || value === "" ? (placeholder !== undefined ? NONE : undefined) : String(value);
  return (
    <div className={cx(hidden && s.srLabel, size === "sm" && s.sm, s.inputWrap, !fullWidth && s.inline)} style={style} title={title}>
      <ArcSelect
        label={label}
        description={field?.error ?? field?.description}
        options={items}
        value={current}
        onValueChange={(v) => onChange(v === NONE ? "" : v)}
        placeholder={placeholder ?? "Select…"}
        disabled={disabled}
        name={name}
        className={className}
      />
    </div>
  );
});
