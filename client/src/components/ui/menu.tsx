import type { ReactElement, ReactNode } from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import arc from "../arc/dropdown-menu/dropdown-menu.module.css";
import { cx } from "./shared";
import s from "./ui.module.css";

export type MenuItem =
  | { type?: "item"; label: ReactNode; icon?: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; shortcut?: string; checked?: boolean; keepOpen?: boolean }
  | { type: "separator" }
  | { type: "heading"; label: ReactNode };

export interface MenuProps {
  trigger: ReactElement;
  items: (MenuItem | false | null | undefined)[];
  placement?: "bottom-start" | "bottom-end" | "top-start" | "right-start";
  width?: number;
}

const PLACE = {
  "bottom-start": { side: "bottom", align: "start" },
  "bottom-end": { side: "bottom", align: "end" },
  "top-start": { side: "top", align: "start" },
  "right-start": { side: "right", align: "start" },
} as const;

/**
 * Dropdown menu on the same Radix primitive and stylesheet as Arc's DropdownMenu. Arc's component draws its own labelled trigger,
 * while the app opens menus from icon buttons and chips, so this keeps Arc's menu surface and items behind any trigger.
 */
export function Menu({ trigger, items, placement = "bottom-start", width }: MenuProps) {
  const list = items.filter(Boolean) as MenuItem[];
  return (
    <DropdownPrimitive.Root modal={false}>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content className={arc.menu} {...PLACE[placement]} sideOffset={6} collisionPadding={12} loop style={width ? { width } : undefined}>
          {list.map((it, i) => {
            if (it.type === "separator") return <DropdownPrimitive.Separator key={i} className={arc.separator} />;
            if (it.type === "heading") return <DropdownPrimitive.Label key={i} className={s.menuHeading}>{it.label}</DropdownPrimitive.Label>;
            return (
              <DropdownPrimitive.Item
                key={i}
                disabled={it.disabled}
                className={cx(arc.item, s.menuItem, it.danger && arc.destructive, it.danger && s.menuDanger)}
                onSelect={(e) => { if (it.keepOpen) e.preventDefault(); it.onSelect?.(); }}
              >
                {it.icon && <span className={arc.icon} aria-hidden="true">{it.icon}</span>}
                <span className={s.menuLabel}>{it.label}</span>
                {it.checked && <Check size={14} className={s.check} />}
                {it.shortcut && <span className={s.menuShortcut}>{it.shortcut}</span>}
              </DropdownPrimitive.Item>
            );
          })}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}
