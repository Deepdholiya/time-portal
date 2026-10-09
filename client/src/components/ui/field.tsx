import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Input as ArcInput } from "../arc/input/input";
import { Textarea as ArcTextarea } from "../arc/textarea/textarea";
import { controlLabel, cx, FieldContext, isFieldOwner, ownsField, textOf, useField } from "./shared";
import s from "./ui.module.css";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  suffix?: ReactNode;
  invalid?: boolean;
  /** Borderless, for inline title editing */
  bare?: boolean;
}

/** Arc Input. Inside a Field it shows the Field's label, hint and error; on its own the aria-label or placeholder becomes a hidden label. */
export const Input = ownsField(forwardRef<HTMLInputElement, InputProps>(function Input({ size = "md", icon, suffix, invalid, bare, className, style, ...rest }, ref) {
  const field = useField();
  if (bare) return <input ref={ref} className={cx(s.bare, className)} style={style} aria-invalid={invalid || undefined} {...rest} />;
  const { label, hidden } = controlLabel(field, rest["aria-label"] ?? (typeof rest.placeholder === "string" ? rest.placeholder : undefined));
  const adorned = !!icon || suffix != null;
  const control = (
    <ArcInput
      ref={ref}
      label={label}
      className={className}
      description={adorned ? undefined : field?.description}
      error={adorned ? undefined : field?.error}
      aria-invalid={invalid || !!field?.error || undefined}
      {...rest}
    />
  );
  return (
    <div className={cx(hidden && s.srLabel, !adorned && !style && s.contents, size !== "md" && s[size], adorned && s.inputWrap, !!icon && s.withIcon, suffix != null && s.withSuffix)} style={style}>
      {control}
      {icon && <span className={cx(s.adorn, s.adornStart)} style={{ top: "auto", height: `var(--control-height-${size})` }}>{icon}</span>}
      {suffix != null && <span className={cx(s.adorn, s.adornEnd)} style={{ top: "auto", height: `var(--control-height-${size})` }}>{suffix}</span>}
      {adorned && field?.error && <div className={s.error}>{field.error}</div>}
      {adorned && !field?.error && field?.description && <div className={s.hint}>{field.description}</div>}
    </div>
  );
}));

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean; bare?: boolean }

/** Arc Textarea, labelled the same way as Input. */
export const Textarea = ownsField(forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, bare, className, ...rest }, ref) {
  const field = useField();
  if (bare) return <textarea ref={ref} className={cx(s.bare, className)} aria-invalid={invalid || undefined} {...rest} />;
  const { label, hidden } = controlLabel(field, rest["aria-label"] ?? (typeof rest.placeholder === "string" ? rest.placeholder : undefined));
  return (
    <div className={cx(s.contents, hidden && s.srLabel)}>
      <ArcTextarea ref={ref} label={label} className={className} description={field?.description} error={field?.error} aria-invalid={invalid || undefined} {...rest} />
    </div>
  );
}));

/** Label + control + hint/error. Arc controls inside it render these themselves; anything else gets the app's field layout. */
export function Field({ label, labelHidden, hint, error, children, className, required }: { label?: ReactNode; /** Name the control for screen readers only, when the label is drawn elsewhere. */ labelHidden?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  if (label && isFieldOwner(children)) {
    const info = { label: textOf(label), required, hidden: labelHidden, description: hint ? textOf(hint) : undefined, error: error ? textOf(error) : undefined };
    return <div className={cx(s.fieldSlot, className)}><FieldContext.Provider value={info}>{children}</FieldContext.Provider></div>;
  }
  return (
    <div className={cx(s.field, className)}>
      {label && !labelHidden && <label>{label}{required && <span className="danger"> *</span>}</label>}
      <FieldContext.Provider value={null}>{children}</FieldContext.Provider>
      {error ? <div className={s.error}>{error}</div> : hint ? <div className={s.hint}>{hint}</div> : null}
    </div>
  );
}
