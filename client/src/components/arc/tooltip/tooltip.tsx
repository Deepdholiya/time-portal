import { cloneElement, isValidElement, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import s from "./tooltip.module.css";

export interface TooltipProps { content: ReactNode; children: ReactElement; shortcut?: string; delay?: number; side?: "top" | "bottom" }

export function Tooltip({ content, children, shortcut, delay = 350, side = "top" }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  if (!content || !isValidElement(children)) return children;
  const p = children.props as Record<string, (e: React.MouseEvent) => void>;
  const show = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPos({ x: r.left + r.width / 2, y: side === "top" ? r.top - 6 : r.bottom + 6 }), delay);
  };
  const hide = () => { clearTimeout(timer.current); setPos(null); };
  return (
    <>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        onMouseEnter: (e: React.MouseEvent) => { p.onMouseEnter?.(e); show(e); },
        onMouseLeave: (e: React.MouseEvent) => { p.onMouseLeave?.(e); hide(); },
        onMouseDown: (e: React.MouseEvent) => { p.onMouseDown?.(e); hide(); },
      })}
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              className={s.tip}
              style={{ left: pos.x, top: pos.y, translateX: "-50%", translateY: side === "top" ? "-100%" : "0%" }}
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}
            >
              {content}
              {shortcut && <span className={s.kbd}>{shortcut}</span>}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
