import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Me, Options, Permissions, TimeEntry } from "./types";

type AppState = {
  me: Me | null; perms: Permissions | null; loading: boolean;
  options: Options | null; refreshOptions: () => Promise<void>;
  timer: TimeEntry | null; setTimer: (t: TimeEntry | null) => void;
  // Bumped whenever time entries change so open pages can reload.
  timeVersion: number; bumpTime: () => void;
  reloadMe: () => Promise<void>; logout: () => Promise<void>;
  toast: (msg: string, kind?: "ok" | "error") => void;
};

const Ctx = createContext<AppState>(null!);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<Options | null>(null);
  const [timer, setTimer] = useState<TimeEntry | null>(null);
  const [timeVersion, setTimeVersion] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);

  const refreshOptions = useCallback(async () => setOptions(await api<Options>("/options")), []);
  const reloadMe = useCallback(async () => {
    try {
      const r = await api<{ user: Me; permissions: Permissions }>("/auth/me");
      setMe(r.user); setPerms(r.permissions);
      const [opts, t] = await Promise.all([api<Options>("/options"), api<TimeEntry | null>("/time/timer")]);
      setOptions(opts); setTimer(t);
    } catch {
      setMe(null); setPerms(null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reloadMe(); }, [reloadMe]);

  const logout = async () => { await api("/auth/logout", { method: "POST" }); setMe(null); setPerms(null); setTimer(null); };
  const toast = (msg: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };

  return (
    <Ctx.Provider value={{ me, perms, loading, options, refreshOptions, timer, setTimer, timeVersion, bumpTime: () => setTimeVersion((v) => v + 1), reloadMe, logout, toast }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
