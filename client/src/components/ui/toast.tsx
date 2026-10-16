import { useEffect, type ReactNode } from "react";
import { ToastStack, ToastStackProvider, useToastStack, type ToastOptions } from "../arc/toast-stack/toast-stack";
import { textOf } from "./shared";

type Opts = { description?: ReactNode; action?: { label: string; onClick: () => void } };
let push: ((t: ToastOptions) => void) | null = null;

function show(type: ToastOptions["type"], title: ReactNode, opts: Opts = {}) {
  push?.({
    type,
    title: textOf(title),
    description: opts.description ? textOf(opts.description) : undefined,
    action: opts.action ? { label: opts.action.label, onClick: () => opts.action!.onClick() } : undefined,
    duration: type === "error" ? 6000 : 3500,
  });
}

/** Imperative toasts: toast.success("Saved"), toast.error(err) */
export const toast = {
  success: (title: ReactNode, opts?: Opts) => show("success", title, opts),
  info: (title: ReactNode, opts?: Opts) => show("info", title, opts),
  error: (e: unknown, opts?: { description?: ReactNode }) => show("error", e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong", opts),
};

function Bridge() {
  const api = useToastStack();
  useEffect(() => {
    push = (t) => api.toast(t);
    return () => { push = null; };
  }, [api]);
  return null;
}

/** Arc ToastStack, fed by the imperative `toast` helpers. Mount once at the app root. */
export function Toaster() {
  return (
    <ToastStackProvider limit={4}>
      <Bridge />
      <ToastStack position="bottom-right" />
    </ToastStackProvider>
  );
}
