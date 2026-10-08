import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import s from "./toast.module.css";

type Kind = "success" | "error" | "info";
interface T { id: number; kind: Kind; title: ReactNode; description?: ReactNode; action?: { label: string; onClick: () => void } }
let seq = 0;
let push: ((t: T) => void) | null = null;

function show(kind: Kind, title: ReactNode, opts: { description?: ReactNode; action?: T["action"] } = {}) {
  push?.({ id: ++seq, kind, title, ...opts });
}
/** Imperative toasts: toast.success("Saved"), toast.error(err) */
export const toast = {
  success: (title: ReactNode, opts?: { description?: ReactNode; action?: T["action"] }) => show("success", title, opts),
  info: (title: ReactNode, opts?: { description?: ReactNode; action?: T["action"] }) => show("info", title, opts),
  error: (e: unknown, opts?: { description?: ReactNode }) => show("error", e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong", opts),
};

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    push = (t) => {
      setItems((x) => [...x.slice(-3), t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.kind === "error" ? 6000 : 3500);
    };
    return () => { push = null; };
  }, []);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  return createPortal(
    <div className={s.stack} aria-live="polite">
      <AnimatePresence>
        {items.map((t) => {
          const I = Icon[t.kind];
          return (
            <motion.div key={t.id} layout className={s.toast} role={t.kind === "error" ? "alert" : "status"} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
              <I size={16} className={`${s.icon} ${s[t.kind]}`} />
              <div className={s.body}>
                <div className={s.title}>{t.title}</div>
                {t.description && <div className={s.desc}>{t.description}</div>}
              </div>
              {t.action && <button className={s.action} onClick={() => { t.action!.onClick(); setItems((x) => x.filter((i) => i.id !== t.id)); }}>{t.action.label}</button>}
              <button className={s.close} aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}><X size={14} /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
