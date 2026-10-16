import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { cx } from "../_lib/floating";
import s from "./tabs.module.css";

export interface TabItem { value: string; label: ReactNode; count?: number; icon?: ReactNode; hidden?: boolean }
/** Linear-style view tabs. variant "pill" for view switchers, "underline" for page sections. */
export function Tabs({ items, value, onChange, variant = "pill", className }: { items: TabItem[]; value: string; onChange: (v: string) => void; variant?: "pill" | "underline"; className?: string }) {
  const id = useId();
  return (
    <div role="tablist" className={cx(s.tabs, variant === "underline" && s.underline, className)}>
      {items.filter((t) => !t.hidden).map((t) => {
        const on = t.value === value;
        return (
          <button key={t.value} role="tab" aria-selected={on} type="button" className={cx(s.tab, on && s.active)} onClick={() => onChange(t.value)}>
            {on && variant === "pill" && <motion.span layoutId={id} className={s.pill} transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            {on && variant === "underline" && <motion.span layoutId={id} className={s.bar} transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <span className={s.label}>{t.icon}{t.label}{t.count !== undefined && <span className={s.count}>{t.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}
