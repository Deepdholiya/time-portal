import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Query, qs } from "./api";

// Tiny stale-while-revalidate cache so moving between pages feels instant.
const cache = new Map<string, unknown>();
const listeners = new Set<(key: string) => void>();

/** Ask every mounted useApi whose path starts with `prefix` to reload (e.g. after a mutation elsewhere). */
export function invalidate(prefix = "") {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  listeners.forEach((l) => l(prefix));
}

export function useApi<T>(path: string | null, query?: Query) {
  const key = path ? path + qs(query) : null;
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(!!key && !cache.has(key));
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!key || !path) return;
    const n = ++seq.current;
    if (!cache.has(key)) setLoading(true);
    try {
      const d = await api<T>(path, { query });
      if (n !== seq.current) return;
      cache.set(key, d);
      setData(d);
      setError(null);
    } catch (e) {
      if (n === seq.current) setError(e as Error);
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (key && cache.has(key)) setData(cache.get(key) as T);
    else setData(undefined);
    load();
  }, [key, load]);

  useEffect(() => {
    if (!key) return;
    const l = (prefix: string) => { if (key.startsWith(prefix)) load(); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [key, load]);

  const mutate = useCallback((d: T | ((prev: T | undefined) => T)) => {
    setData((prev) => {
      const next = typeof d === "function" ? (d as (p: T | undefined) => T)(prev) : d;
      if (key) cache.set(key, next);
      return next;
    });
  }, [key]);

  return { data, error, loading, reload: load, mutate };
}

/** Persisted UI preference (view mode, filters). Falls back silently when storage is unavailable. */
export function useLocal<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem("tp:" + key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem("tp:" + key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV] as const;
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Global keyboard shortcut; ignored while typing in inputs unless allowInInputs. */
export function useHotkey(combo: string, fn: (e: KeyboardEvent) => void, opts: { allowInInputs?: boolean; enabled?: boolean } = {}) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (opts.enabled === false) return;
    const parts = combo.toLowerCase().split("+");
    const key = parts.pop()!;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing && !opts.allowInInputs) return;
      const mod = parts.includes("mod");
      if (mod !== (e.metaKey || e.ctrlKey)) return;
      if (parts.includes("shift") !== e.shiftKey) return;
      if (e.key.toLowerCase() !== key) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [combo, opts.allowInInputs, opts.enabled]);
}
