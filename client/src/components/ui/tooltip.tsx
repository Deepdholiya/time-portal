import { isValidElement, type ReactElement, type ReactNode } from "react";
import { Tooltip as ArcTooltip } from "../arc/tooltip/tooltip";
import s from "./ui.module.css";

export interface TooltipProps { content: ReactNode; children: ReactElement; shortcut?: string; delay?: number; side?: "top" | "bottom" }

/** Arc Tooltip, with an optional keyboard hint after the text. */
export function Tooltip({ content, children, shortcut, side = "top" }: TooltipProps) {
  if (!content || !isValidElement(children)) return children;
  return <ArcTooltip side={side} content={shortcut ? <span className="row gap-4">{content}<kbd className={s.kbd}>{shortcut}</kbd></span> : content}>{children}</ArcTooltip>;
}
