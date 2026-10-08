import { useState, type ReactElement, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Popover } from "../popover/popover";
import { cx } from "../_lib/floating";
import s from "./menu.module.css";

export type MenuItem =
  | { type?: "item"; label: ReactNode; icon?: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; shortcut?: string; checked?: boolean; keepOpen?: boolean }
  | { type: "separator" }
  | { type: "heading"; label: ReactNode };

type ItemOf = Exclude<MenuItem, { type: "separator" } | { type: "heading"; label: ReactNode }>;

export interface MenuProps {
  trigger: ReactElement;
  items: (MenuItem | false | null | undefined)[];
  placement?: "bottom-start" | "bottom-end" | "top-start" | "right-start";
  width?: number;
}

/** Dropdown menu with keyboard navigation (↑ ↓ Enter). */
export function Menu({ trigger, items, placement = "bottom-start", width }: MenuProps) {
  const list = items.filter(Boolean) as MenuItem[];
  const [hi, setHi] = useState(-1);
  const actionable = list.map((it, i) => ((it.type ?? "item") === "item" && !(it as { disabled?: boolean }).disabled ? i : -1)).filter((i) => i >= 0);
  return (
    <Popover trigger={trigger} placement={placement} padded={false} width={width} onOpenChange={(o) => !o && setHi(-1)}>
      {(close) => (
        <div
          className={s.menu}
          role="menu"
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const pos = actionable.indexOf(hi);
              const next = e.key === "ArrowDown" ? actionable[(pos + 1) % actionable.length] : actionable[(pos - 1 + actionable.length) % actionable.length];
              setHi(next ?? -1);
            } else if (e.key === "Enter" && hi >= 0) {
              e.preventDefault();
              const it = list[hi] as ItemOf;
              it.onSelect?.();
              if (!it.keepOpen) close();
            }
          }}
        >
          {list.map((it, i) => {
            if (it.type === "separator") return <div key={i} className={s.sep} />;
            if (it.type === "heading") return <div key={i} className={s.heading}>{it.label}</div>;
            return (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                className={cx(s.item, it.danger && s.danger, hi === i && s.highlight)}
                onMouseEnter={() => setHi(i)}
                onClick={() => { it.onSelect?.(); if (!it.keepOpen) close(); }}
              >
                {it.icon}
                <span className={s.label}>{it.label}</span>
                {it.checked && <Check size={14} className={s.check} />}
                {it.shortcut && <span className={s.shortcut}>{it.shortcut}</span>}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
