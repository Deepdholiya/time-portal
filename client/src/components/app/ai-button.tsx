import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Sparkles, X } from "lucide-react";
import { Button, Popover, Tooltip, toast } from "@/components/ui";
import { useSession } from "@/lib/session";
import s from "./ai-button.module.css";

export type AiSource = "claude" | "template";

/** True when the signed-in person may use AI and their company has the assistant turned on. */
export function useAiAvailable() {
  const { me, can } = useSession();
  return !!me && can("aiAssist", "yes") && me.company?.settings?.aiEnabled !== false;
}

export interface AiButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** What the button does; used for the tooltip and the accessible name. */
  label: string;
  size?: "md" | "sm";
  loading?: boolean;
  /** Render even when AI isn't available (for example inside a component that already checked). */
  force?: boolean;
}

const Inner = forwardRef<HTMLButtonElement, AiButtonProps>(function Inner({ label, size = "md", loading, disabled, className, force: _f, ...rest }, ref) {
  return (
    <button
      ref={ref} type="button" aria-label={label} aria-busy={loading || undefined} disabled={disabled || loading}
      className={[s.btn, size === "sm" && s.sm, className].filter(Boolean).join(" ")} {...rest}
    >
      {loading ? <span className={s.spin} aria-hidden /> : <Sparkles size={size === "sm" ? 14 : 16} strokeWidth={2} aria-hidden />}
    </button>
  );
});

/** Square, icon-only button for AI actions, in the same neutral outline everywhere. Hidden when the person can't use AI. Forwards its ref so it can be a popover trigger. */
export const AiButton = forwardRef<HTMLButtonElement, AiButtonProps>(function AiButton(props, ref) {
  const available = useAiAvailable();
  if (!available && !props.force) return null;
  return <Tooltip content={props.label}><Inner ref={ref} {...props} /></Tooltip>;
});

/** Small panel for AI-written text, labeled with where it came from. */
export function AiPanel({ title = "AI summary", source, onClose, children }: { title?: ReactNode; source?: AiSource; onClose?: () => void; children: ReactNode }) {
  return (
    <div className={s.panel} role="region" aria-label={typeof title === "string" ? title : "AI summary"}>
      <div className={s.panelHead}>
        <span className={s.panelIcon}><Sparkles size={12} /></span>
        <span className={s.panelTitle}>{title}</span>
        {source && <span className={s.source}>{source === "claude" ? "Written by Claude" : "Built-in summary"}</span>}
        {onClose && <button type="button" className={s.close} aria-label="Close summary" onClick={onClose}><X size={13} /></button>}
      </div>
      <div className={s.panelBody}>{children}</div>
    </div>
  );
}

/** One-line hint under a field filled by AI. */
export function aiSourceNote(source?: AiSource | null) {
  return source ? (source === "claude" ? "Drafted by Claude. Review before saving." : "Drafted from a built-in template. Review before saving.") : null;
}

/**
 * AI button that opens a small popover with a generated summary (project status, report recap, today's focus).
 * `load` returns the text and where it came from; it runs on open and again on "Regenerate".
 */
export function AiInsight({ label, title = "AI summary", load, size, placement = "bottom-end", width = 380 }: {
  label: string; title?: string; load: () => Promise<{ summary: string; source: AiSource }>; size?: "md" | "sm";
  placement?: "bottom-start" | "bottom-end"; width?: number;
}) {
  const available = useAiAvailable();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ summary: string; source: AiSource } | null>(null);
  const run = async () => {
    setBusy(true);
    try { setResult(await load()); } catch (e) { toast.error(e); setOpen(false); } finally { setBusy(false); }
  };
  if (!available) return null;
  return (
    <Popover
      open={open} placement={placement} width={width} padded={false}
      onOpenChange={(v) => { setOpen(v); if (v) { setResult(null); run(); } }}
      trigger={<AiButton label={label} size={size} loading={busy && !open} />}
    >
      <div className={s.insight}>
        <AiPanel title={title} source={result?.source} onClose={() => setOpen(false)}>
          {busy || !result ? <span className={s.thinking}><span className={s.spinDark} aria-hidden />Thinking…</span> : result.summary}
        </AiPanel>
        {result && !busy && <div className={s.insightFoot}><Button size="sm" variant="ghost" onClick={run}>Regenerate</Button></div>}
      </div>
    </Popover>
  );
}

/**
 * AI button that first asks what you want: a short prompt box (optional, with a few example chips), then "Generate".
 * Used wherever AI fills in data for you (task description, sub-tasks, time entry, expense), so you can steer the result.
 */
export function AiPromptButton({ label, title, placeholder, suggestions = [], loading, size, disabled, placement = "bottom-end", onRun }: {
  label: string; title?: string; placeholder?: string; suggestions?: string[]; loading?: boolean; size?: "md" | "sm"; disabled?: boolean;
  placement?: "bottom-start" | "bottom-end"; onRun: (prompt: string) => void;
}) {
  const available = useAiAvailable();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) setTimeout(() => box.current?.focus(), 30); }, [open]);
  if (!available) return null;
  const go = () => { setOpen(false); onRun(prompt.trim()); };
  return (
    <Popover
      open={open} onOpenChange={setOpen} placement={placement} width={340} padded={false}
      trigger={<AiButton label={label} size={size} loading={loading} disabled={disabled} />}
    >
      <form className={s.prompt} onSubmit={(e) => { e.preventDefault(); go(); }}>
        <div className={s.promptHead}><Sparkles size={13} />{title ?? label}</div>
        <textarea
          ref={box} className={s.promptBox} rows={2} value={prompt} maxLength={500} aria-label="What should AI do?"
          placeholder={placeholder ?? "Tell AI what you want (optional)"}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }}
        />
        {!!suggestions.length && (
          <div className={s.promptChips}>
            {suggestions.map((x) => <button key={x} type="button" className={s.promptChip} onClick={() => { setPrompt(x); box.current?.focus(); }}>{x}</button>)}
          </div>
        )}
        <div className={s.promptFoot}>
          <span className={s.promptHint}>Leave empty for a standard draft.</span>
          <Button size="sm" variant="primary" type="submit" icon={<Sparkles size={13} />}>Generate</Button>
        </div>
      </form>
    </Popover>
  );
}

/** Prompt bar at the top of an AI review dialog: type what to change and run it again. */
export function AiPromptBar({ value, onChange, onRun, busy, placeholder, suggestions = [] }: {
  value: string; onChange: (v: string) => void; onRun: () => void; busy?: boolean; placeholder?: string; suggestions?: string[];
}) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <form className={s.bar} onSubmit={(e) => { e.preventDefault(); onRun(); }}>
      <div className={s.barRow}>
        <Sparkles size={14} className={s.barIcon} />
        <input ref={field} className={s.barInput} value={value} maxLength={500} placeholder={placeholder ?? "Tell AI what you want…"} aria-label="Instructions for AI" onChange={(e) => onChange(e.target.value)} />
        <Button size="sm" variant="primary" type="submit" loading={busy} disabled={busy}>{value.trim() ? "Generate" : "Regenerate"}</Button>
      </div>
      {!!suggestions.length && (
        <div className={s.promptChips}>
          {suggestions.map((x) => <button key={x} type="button" className={s.promptChip} onClick={() => { onChange(x); field.current?.focus(); }}>{x}</button>)}
        </div>
      )}
    </form>
  );
}
