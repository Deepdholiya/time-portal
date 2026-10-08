import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion } from "motion/react";
import { cx } from "../_lib/floating";
import s from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "link";
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  /** Icon rendered before the label */
  icon?: ReactNode;
  /** Icon rendered after the label */
  iconRight?: ReactNode;
  /** Keyboard hint shown at the end, e.g. "C" */
  shortcut?: string;
  active?: boolean;
  fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = { primary: s.primary, secondary: s.secondary, ghost: s.ghost, danger: s.danger, "danger-ghost": s.dangerGhost, link: s.link };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, iconRight, shortcut, active, fullWidth, className, children, disabled, type = "button", ...rest },
  ref,
) {
  const iconOnly = !children && !!icon;
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={cx(s.button, s[size], variantClass[variant], iconOnly && s.iconOnly, active && s.active, fullWidth && s.full, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={s.loadingLayer}><span className={s.spinner} /></span>}
      <span className={cx("row", loading && s.hidden)} style={{ gap: "inherit" }}>
        {icon}
        {children}
        {iconRight}
        {shortcut && <span className={s.shortcut}>{shortcut}</span>}
      </span>
    </motion.button>
  );
});

/** Square icon-only button; `label` is required for screen readers and shows as a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "children"> & { label: string }>(function IconButton({ label, variant = "ghost", ...rest }, ref) {
  return <Button ref={ref} variant={variant} aria-label={label} title={label} {...rest} />;
});
