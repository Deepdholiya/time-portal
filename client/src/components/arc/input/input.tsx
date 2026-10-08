import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cx } from "../_lib/floating";
import s from "./input.module.css";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  suffix?: ReactNode;
  invalid?: boolean;
  /** Borderless, for inline title editing */
  bare?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ size = "md", icon, suffix, invalid, bare, className, style, ...rest }, ref) {
  return (
    <div className={s.wrap} style={style}>
      {icon && <span className={s.icon}>{icon}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cx(s.input, size !== "md" && s[size], !!icon && s.withIcon, !!suffix && s.withSuffix, invalid && s.invalid, bare && s.bare, className)}
        {...rest}
      />
      {suffix && <span className={s.suffix}>{suffix}</span>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean; bare?: boolean }
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, bare, className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(s.input, s.textarea, invalid && s.invalid, bare && s.bare, className)} {...rest} />;
});

/** Label + control + hint/error, in the app's form style. */
export function Field({ label, hint, error, children, className, required }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={cx("field", className)}>
      {label && <label>{label}{required && <span className="danger"> *</span>}</label>}
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}
