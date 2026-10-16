import { forwardRef, type ReactNode } from "react";
import { Button as ArcButton, type ButtonProps as ArcButtonProps } from "../arc/button/button";
import { cx } from "./shared";
import s from "./ui.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "link";
export interface ButtonProps extends Omit<ArcButtonProps, "variant" | "size"> {
  variant?: ButtonVariant;
  size?: "xs" | "sm" | "md" | "lg";
  /** Icon rendered before the label */
  icon?: ReactNode;
  /** Icon rendered after the label */
  iconRight?: ReactNode;
  /** Keyboard hint shown at the end, e.g. "C" */
  shortcut?: string;
  active?: boolean;
  fullWidth?: boolean;
}

const arcVariant = { primary: "primary", secondary: "secondary", ghost: "ghost", danger: "danger", "danger-ghost": "ghost", link: "ghost" } as const;
const extra: Record<ButtonVariant, string | undefined> = { primary: s.primary, secondary: undefined, ghost: undefined, danger: undefined, "danger-ghost": s.dangerGhost, link: s.link };

/** Arc Button with the app's icon, shortcut and variant conveniences. Defaults to a secondary, non-submitting button. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconRight, shortcut, active, fullWidth, className, children, type = "button", ...rest },
  ref,
) {
  const iconOnly = children == null && !!icon;
  return (
    <ArcButton
      ref={ref}
      type={type}
      variant={arcVariant[variant]}
      size={size === "xs" ? "sm" : size}
      className={cx(s.btn, extra[variant], size === "xs" && s.xs, iconOnly && s.icon, iconOnly && s[size === "xs" ? "sm" : size], active && s.active, fullWidth && s.full, className)}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
      {shortcut && <span className={s.shortcut}>{shortcut}</span>}
    </ArcButton>
  );
});

/** Square icon-only button; `label` is required for screen readers and shows as a native tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "children"> & { label: string }>(function IconButton({ label, variant = "ghost", size = "sm", ...rest }, ref) {
  return <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} {...rest} />;
});
