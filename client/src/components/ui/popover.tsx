import { useState, type ReactElement, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Popover as ArcPopover, PopoverContent } from "../arc/popover/popover";
import { cx } from "./shared";
import s from "./ui.module.css";

export interface PopoverProps {
  /** Element that toggles the popover. */
  trigger: ReactElement;
  children: ReactNode | ((close: () => void) => ReactNode);
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "right-start";
  padded?: boolean;
  width?: number | string;
  matchWidth?: boolean;
  className?: string;
}

const PLACE = {
  "bottom-start": { side: "bottom", align: "start" },
  "bottom-end": { side: "bottom", align: "end" },
  "top-start": { side: "top", align: "start" },
  "right-start": { side: "right", align: "start" },
} as const;

/** Arc Popover with a render-prop close, used by pickers and filters. */
export function Popover({ trigger, children, open: controlled, onOpenChange, placement = "bottom-start", padded = true, width, matchWidth, className }: PopoverProps) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (v: boolean) => { setInner(v); onOpenChange?.(v); };
  return (
    <ArcPopover open={open} onOpenChange={setOpen}>
      {/* The bare Radix trigger: Arc's PopoverTrigger adds a class, which triggers that spread their props after className would lose. */}
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverContent
        {...PLACE[placement]}
        className={cx(s.pop, padded && s.padded, className)}
        style={{ width: matchWidth ? "var(--radix-popover-trigger-width)" : width, minWidth: matchWidth ? "var(--radix-popover-trigger-width)" : undefined }}
        onOpenAutoFocus={(e) => { const field = (e.currentTarget as HTMLElement).querySelector<HTMLElement>("input, [tabindex='0']"); if (field) { e.preventDefault(); field.focus(); } }}
      >
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </PopoverContent>
    </ArcPopover>
  );
}
