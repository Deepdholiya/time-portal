import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { cx } from "../_lib/floating";
import s from "./segmented-control.module.css";

export function SegmentedControl<T extends string>({ options, value, onChange, "aria-label": ariaLabel }: { options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; "aria-label"?: string }) {
  const id = useId();
  return (
    <div className={s.root} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title} className={cx(s.item, o.value === value && s.on)} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={id} className={s.thumb} transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          <span className={s.label}>{o.icon}{o.label}</span>
        </button>
      ))}
    </div>
  );
}
