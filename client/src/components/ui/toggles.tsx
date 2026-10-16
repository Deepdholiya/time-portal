import type { ReactNode } from "react";
import { Checkbox as ArcCheckbox } from "../arc/checkbox/checkbox";
import { Switch as ArcSwitch } from "../arc/switch/switch";
import { textOf } from "./shared";

/** Arc Checkbox with a boolean onChange. Clicks don't bubble, so it can sit inside clickable rows. */
export function Checkbox({ checked, onChange, label, disabled, indeterminate, "aria-label": ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; indeterminate?: boolean; "aria-label"?: string }) {
  return (
    <span style={{ display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <ArcCheckbox
        checked={indeterminate ? "indeterminate" : checked}
        onCheckedChange={(v) => onChange(v === true)}
        label={label ? textOf(label) : undefined}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </span>
  );
}

/** Arc Switch with a boolean onChange. */
export function Switch({ checked, onChange, label, disabled, "aria-label": ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; "aria-label"?: string }) {
  return <ArcSwitch checked={checked} onCheckedChange={onChange} label={label ? textOf(label) : undefined} disabled={disabled} aria-label={ariaLabel} />;
}
