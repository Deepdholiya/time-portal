import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, post } from "./api";
import { invalidate } from "./hooks";
import type { Me } from "./types";

// Ordered levels per feature, mirroring server/src/permissions.ts. The server is the authority; this only hides UI.
export const LEVELS: Record<string, string[]> = {
  timesheetsView: ["own", "all"], editOthersTime: ["no", "yes"], approveTimesheets: ["no", "yes"], leaveApprove: ["no", "yes"],
  analytics: ["none", "own", "all"], financials: ["none", "view"], export: ["none", "own", "all"], roadmap: ["none", "view", "edit"],
  projects: ["view", "manage"], tasks: ["own", "create", "manage"], directory: ["limited", "full"], people: ["none", "invite", "manage"],
  aiAssist: ["no", "yes"], clientEmail: ["no", "yes"], audit: ["no", "yes"], settings: ["no", "yes"], companies: ["no", "yes"],
};

type Status = "loading" | "anon" | "mfa" | "ready";
interface SessionValue {
  status: Status;
  me: Me | null;
  /** True when the user's level for `feature` is at least `level` (defaults to the lowest non-zero level). */
  can: (feature: string, level?: string) => boolean;
  isAdmin: boolean;
  isManager: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  switchCompany: (companyId: number) => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/auth/me");
      setMe(m);
      setStatus("ready");
    } catch (e) {
      setMe(null);
      setStatus(e instanceof ApiError && e.code === "MFA_REQUIRED" ? "mfa" : "anon");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener("tp:session", h);
    return () => window.removeEventListener("tp:session", h);
  }, [refresh]);

  const logout = useCallback(async () => {
    await post("/auth/logout").catch(() => {});
    invalidate();
    setMe(null);
    setStatus("anon");
  }, []);

  const switchCompany = useCallback(async (companyId: number) => {
    await post("/auth/switch-company", { companyId });
    invalidate();
    await refresh();
  }, [refresh]);

  const value = useMemo<SessionValue>(() => {
    const can = (feature: string, level?: string) => {
      const have = me?.permissions[feature];
      const order = LEVELS[feature];
      if (!have || !order) return false;
      const need = level ?? order[1] ?? order[0];
      return order.indexOf(have) >= order.indexOf(need);
    };
    return { status, me, can, isAdmin: me?.user.role === "ADMIN", isManager: me?.user.role === "MANAGER", refresh, logout, switchCompany };
  }, [status, me, refresh, logout, switchCompany]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

/** The signed-in session; only call inside the authenticated app shell. */
export function useMe() {
  const { me, ...rest } = useSession();
  return { me: me!, ...rest, currency: me!.company.currency, settings: me!.company.settings };
}
