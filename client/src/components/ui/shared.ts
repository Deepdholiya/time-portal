import { Children, createContext, isValidElement, useContext, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Plain text of a node, for Arc props that take a string (titles, labels). */
export function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  const parts = Array.isArray(node) ? node : isValidElement(node) ? Children.toArray((node.props as { children?: ReactNode }).children) : [];
  return parts.map(textOf).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Label, hint and error a Field hands to the Arc control inside it, so the control renders them in its own field layout. */
export interface FieldInfo { label: string; required?: boolean; description?: string; error?: string; hidden?: boolean }
export const FieldContext = createContext<FieldInfo | null>(null);
export const useField = () => useContext(FieldContext);

/** Marks adapters that render Arc's own label, hint and error, so Field does not draw a second label around them. */
export const ownsField = <T extends object>(component: T) => Object.assign(component, { ownsField: true as const });
export const isFieldOwner = (node: ReactNode) => isValidElement(node) && typeof node.type !== "string" && (node.type as { ownsField?: boolean }).ownsField === true;

/** Label for an Arc control: the Field's label, else the aria-label or placeholder, which the adapter hides visually. */
export function controlLabel(field: FieldInfo | null, fallback?: string) {
  return { label: field ? field.label + (field.required ? " *" : "") : fallback || "Value", hidden: !field || !!field.hidden };
}
