import { cloneElement, isValidElement, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cx, useDismiss, useFloating, useLayerId } from "../_lib/floating";
import s from "./popover.module.css";

export interface PopoverProps {
  /** Element that toggles the popover; receives onClick and a ref. */
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

export function Popover({ trigger, children, open: controlled, onOpenChange, placement, padded = true, width, matchWidth, className }: PopoverProps) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (v: boolean) => { setInner(v); onOpenChange?.(v); };
  const anchor = useRef<HTMLElement | null>(null);
  const layer = useLayerId(open);
  const { floating, style } = useFloating(open, anchor, { placement, matchWidth });
  useDismiss(open, [anchor, floating], () => setOpen(false), layer);
  const close = () => setOpen(false);

  const t = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        ref: (el: HTMLElement | null) => { anchor.current = el; },
        onClick: (e: React.MouseEvent) => { (trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e); setOpen(!open); },
        "aria-expanded": open,
        "aria-haspopup": "dialog",
      })
    : trigger;

  return (
    <>
      {t}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={floating}
              data-layer={layer}
              role="dialog"
              className={cx(s.content, padded && s.padded, className)}
              style={{ ...style, width }}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
              transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
            >
              {typeof children === "function" ? children(close) : children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
