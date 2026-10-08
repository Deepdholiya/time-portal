import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { IconButton } from "../button/button";
import { useLayerId } from "../_lib/floating";
import s from "./sheet.module.css";

/** Right-side panel, used for task and entry details like Linear's peek view. */
export function Sheet({ open, onClose, title, actions, children, width = 640 }: { open: boolean; onClose: () => void; title?: ReactNode; actions?: ReactNode; children: ReactNode; width?: number }) {
  const layer = useLayerId(open);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = Math.max(0, ...[...document.querySelectorAll<HTMLElement>("[data-layer]")].map((l) => Number(l.dataset.layer)));
      if (top > layer) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") { t.blur(); return; }
      onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, layer, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className={s.overlay} data-layer={layer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose} />
          <motion.aside
            className={s.sheet}
            data-layer={layer}
            role="dialog"
            aria-modal="true"
            style={{ width }}
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          >
            <div className={s.header}>
              <div className={s.title}>{title}</div>
              {actions}
              <IconButton label="Close (Esc)" icon={<X size={16} />} onClick={onClose} />
            </div>
            <div className={s.body}>{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
