import { useLayoutEffect, type RefObject } from "react";

/** Space every floating panel keeps from the edges of the screen. Radix-positioned panels pass it as collisionPadding. */
export const VIEWPORT_MARGIN = 8;

export interface AnchoredPanelOptions {
  /** Gap between the anchor and the panel. */
  offset?: number;
  /** Give the panel the anchor's width (dropdown lists). */
  matchWidth?: boolean;
  /** Which edge of the anchor the panel lines up with before it is shifted back on screen. */
  align?: "start" | "end";
}

/** The element a position: fixed panel is laid out against: the nearest ancestor that creates a containing block, or the viewport. */
function containingBlock(panel: HTMLElement): HTMLElement | null {
  for (let el = panel.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.transform !== "none" || cs.perspective !== "none" || cs.filter !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none")
      || /paint|layout|strict|content/.test(cs.contain) || /transform|perspective|filter/.test(cs.willChange)) return el;
  }
  return null;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

/**
 * Keeps a panel that is rendered next to its trigger (Arc DatePicker, Combobox, MultiSelect) inside the viewport.
 * The panel is switched to position: fixed, so a scrolling Sheet body neither clips it nor grows a scrollbar for it, then
 * placed below the anchor, flipped above it when there is more room there, and shifted sideways to stay VIEWPORT_MARGIN
 * from every edge. It follows the anchor while the page or a sheet scrolls and while either element resizes.
 */
export function useAnchoredPanel(open: boolean, anchorRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>, { offset = 8, matchWidth = false, align = "start" }: AnchoredPanelOptions = {}) {
  useLayoutEffect(() => {
    const anchor = anchorRef.current, panel = panelRef.current;
    if (!open || !anchor || !panel) return;
    const M = VIEWPORT_MARGIN;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      if (matchWidth) panel.style.width = `${a.width}px`;
      // offsetWidth/Height ignore the panel's own open animation (scale), so the measurement is its resting size.
      const w = panel.offsetWidth, h = panel.offsetHeight;
      const below = vh - a.bottom - offset - M, above = a.top - offset - M;
      const side = h > below && above > below ? "top" : "bottom";
      const top = clamp(side === "bottom" ? a.bottom + offset : a.top - offset - h, M, Math.max(M, vh - M - h));
      const left = clamp(align === "end" ? a.right - w : a.left, M, Math.max(M, vw - M - w));
      // A transformed ancestor turns position: fixed into position: absolute against itself; convert to its coordinates.
      const cb = containingBlock(panel);
      const r = cb?.getBoundingClientRect();
      const dx = cb && r ? r.left + cb.clientLeft - cb.scrollLeft : 0, dy = cb && r ? r.top + cb.clientTop - cb.scrollTop : 0;
      Object.assign(panel.style, { position: "fixed", top: `${top - dy}px`, left: `${left - dx}px`, right: "auto", bottom: "auto", transformOrigin: side === "top" ? "bottom left" : "top left" });
      panel.dataset.side = side;
    };
    place();
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    ro?.observe(panel); ro?.observe(anchor);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); ro?.disconnect(); };
  }, [open, anchorRef, panelRef, offset, matchWidth, align]);
}
