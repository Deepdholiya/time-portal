import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Positions a fixed-position floating element under (or above) its anchor and keeps it inside the viewport. */
export function useFloating(open: boolean, anchor: RefObject<HTMLElement | null>, opts: { placement?: "bottom-start" | "bottom-end" | "top-start" | "right-start"; offset?: number; matchWidth?: boolean } = {}) {
  const floating = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", top: -9999, left: -9999 });
  const place = opts.placement ?? "bottom-start";
  const off = opts.offset ?? 4;

  const update = useCallback(() => {
    const a = anchor.current, f = floating.current;
    if (!a || !f) return;
    const r = a.getBoundingClientRect();
    const fw = f.offsetWidth, fh = f.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let top = place.startsWith("top") ? r.top - fh - off : place === "right-start" ? r.top : r.bottom + off;
    let left = place.endsWith("end") ? r.right - fw : place === "right-start" ? r.right + off : r.left;
    if (top + fh > vh - 8 && r.top - fh - off > 8) top = r.top - fh - off;
    if (top < 8) top = 8;
    if (left + fw > vw - 8) left = Math.max(8, vw - fw - 8);
    if (left < 8) left = 8;
    setStyle({ position: "fixed", top, left, minWidth: opts.matchWidth ? r.width : undefined, maxHeight: Math.max(160, vh - top - 12) });
  }, [anchor, place, off, opts.matchWidth]);

  useLayoutEffect(() => { if (open) update(); }, [open, update]);
  useEffect(() => {
    if (!open) return;
    const ro = new ResizeObserver(update);
    if (floating.current) ro.observe(floating.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, update]);

  return { floating, style, update };
}

let layerSeq = 0;
/** A stacking id for a floating layer; put it on the layer root as data-layer so nested layers don't dismiss their parents. */
export function useLayerId(open: boolean) {
  const [id, setId] = useState(0);
  useEffect(() => { if (open) setId(++layerSeq); }, [open]);
  return id;
}

/** Calls `onOutside` for pointer-downs outside the given elements (and outside layers opened later), and on Escape. */
export function useDismiss(open: boolean, refs: RefObject<HTMLElement | null>[], onOutside: () => void, layerId = 0) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!open) return;
    const above = (t: Element | null) => {
      const layer = t?.closest?.("[data-layer]") as HTMLElement | null;
      return !!layer && Number(layer.dataset.layer) > layerId;
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (refs.some((r) => r.current?.contains(t)) || above(t)) return;
      cb.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the topmost layer closes on Escape.
      const layers = [...document.querySelectorAll<HTMLElement>("[data-layer]")].map((l) => Number(l.dataset.layer));
      if (layers.some((l) => l > layerId)) return;
      e.stopPropagation();
      cb.current();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, layerId]);
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
