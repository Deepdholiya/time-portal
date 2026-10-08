import { type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Dialog as ArcDialog, DialogContent } from "../arc/dialog/dialog";
import { Drawer, DrawerContent } from "../arc/drawer/drawer";
import { Button } from "./button";
import { cx, textOf } from "./shared";
import s from "./ui.module.css";

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

const WIDTH = { sm: 420, md: 520, lg: 680, xl: 880 };

/** Focus the first text field rather than Arc's close button. Comboboxes are skipped, since Arc's opens its list on focus. */
function focusFirstField(e: Event) {
  const root = e.currentTarget as HTMLElement | null;
  const first = root?.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]):not([disabled]):not([role=combobox]), textarea:not([disabled])");
  e.preventDefault();
  (first ?? root)?.focus();
}

/** Arc Dialog with the app's footer and form handling. */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", onSubmit, dismissable = true }: DialogProps) {
  const body = <>{children}{footer && <div className={s.footer}>{footer}</div>}</>;
  return (
    <ArcDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        title={textOf(title)}
        description={description ? textOf(description) : undefined}
        className={s.dialog}
        style={{ "--dialog-w": `${WIDTH[size]}px` } as CSSProperties}
        onOpenAutoFocus={focusFirstField}
        onPointerDownOutside={dismissable ? undefined : (e) => e.preventDefault()}
      >
        {onSubmit ? <form className={s.dialogForm} onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>{body}</form> : body}
      </DialogContent>
    </ArcDialog>
  );
}

/** Confirmation dialog for destructive or outward-facing actions. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", danger, loading, children }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; description?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; children?: ReactNode;
}) {
  return (
    <Dialog
      open={open} onClose={onClose} title={title} description={description} size="sm" onSubmit={onConfirm}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={danger ? "danger" : "primary"} loading={loading}>{confirmLabel}</Button>
      </>}
    >
      {children}
    </Dialog>
  );
}

/** Arc Drawer from the right, used for task and entry details like Linear's peek view. Header actions sit in a bar above the body. */
export function Sheet({ open, onClose, title, actions, children, width = 640 }: { open: boolean; onClose: () => void; title?: ReactNode; actions?: ReactNode; children: ReactNode; width?: number }) {
  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent
        title={textOf(title) || "Details"}
        side="right"
        className={s.sheet}
        style={{ "--sheet-w": `${width}px` } as CSSProperties}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          // Escape in a field leaves the field first, like Linear; a second Escape closes the panel.
          const t = document.activeElement as HTMLElement | null;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) { e.preventDefault(); t.blur(); }
        }}
      >
        {actions && <div className={cx(s.sheetActions)}>{actions}</div>}
        {children}
      </DrawerContent>
    </Drawer>
  );
}
