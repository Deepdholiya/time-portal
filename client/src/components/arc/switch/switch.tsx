import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cx } from "../_lib/floating";
import s from "./switch.module.css";

export function Switch({ checked, onChange, label, disabled, "aria-label": ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; "aria-label"?: string }) {
  const btn = (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled} className={cx(s.track, checked && s.on)} onClick={() => onChange(!checked)}>
      <motion.span className={s.thumb} animate={{ x: checked ? 12 : 0 }} transition={{ type: "spring", stiffness: 700, damping: 35 }} />
    </button>
  );
  if (!label) return btn;
  return <label className={s.label}>{btn}<span>{label}</span></label>;
}
