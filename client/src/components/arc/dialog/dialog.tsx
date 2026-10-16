import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Button, IconButton } from "../button/button";
import { cx, useLayerId } from "../_lib/floating";
import s from "./dialog.module.css";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Wrap the body in a form; Enter submits. */
  onSubmit?: () => void;
  /** Prevent closing by clicking the backdrop (for forms with unsaved input). */
  dismissable?: boolean;
}

export function Dialog({ open, onClose, title, description, children, footer, size = "md", onSubmit, dismissable = true }: DialogProps) {
  const layer = useLayerId(open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]):not([disabled]), textarea, select");
      (first ?? ref.current)?.focus();
    }, 30);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = Math.max(0, ...[...document.querySelectorAll<HTMLElement>("[data-layer]")].map((l) => Number(l.dataset.layer)));
      if (top > layer) return;
      onClose();
    };
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [open, layer, onClose]);

  const Body = onSubmit ? "form" : "div";
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={s.overlay}
          data-layer={layer}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (dismissable && e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={cx(s.dialog, s[size])}
            initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          >
            <Body
              style={{ display: "contents" }}
              onSubmit={onSubmit ? (e: React.FormEvent) => { e.preventDefault(); onSubmit(); } : undefined}
            >
              {(title || description) && (
                <div className={s.header}>
                  <div>
                    {title && <div className={s.title}>{title}</div>}
                    {description && <div className={s.description}>{description}</div>}
                  </div>
                  <IconButton className={s.close} label="Close" icon={<X size={16} />} onClick={onClose} />
                </div>
              )}
              {children && <div className={s.body}>{children}</div>}
              {footer && <div className={s.footer}>{footer}</div>}
            </Body>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Confirmation dialog for destructive or outward-facing actions. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", danger, loading, children }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; description?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; children?: ReactNode;
}) {
  return (
    <Dialog
      open={open} onClose={onClose} title={title} description={description} size="sm" onSubmit={onConfirm}
      footer={<><ButtonRow onClose={onClose} confirmLabel={confirmLabel} danger={danger} loading={loading} /></>}
    >
      {children}
    </Dialog>
  );
}

function ButtonRow({ onClose, confirmLabel, danger, loading }: { onClose: () => void; confirmLabel: string; danger?: boolean; loading?: boolean }) {
  return (
    <>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} loading={loading}>{confirmLabel}</Button>
    </>
  );
}
