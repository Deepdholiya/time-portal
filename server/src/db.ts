import { PrismaClient } from "@prisma/client";
import type { Request } from "express";

export const prisma = new PrismaClient();

type AuditExtra = { old?: unknown; new?: unknown; reason?: string | null; companyId?: number | null; userId?: number | null };
const json = (v: unknown) => (v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v));

// Records who did what, with old and new values, from the request context when there is one.
export async function audit(req: Request | null, action: string, entity: string, entityId?: number | null, extra: AuditExtra = {}) {
  await prisma.auditLog.create({
    data: {
      action, entity, entityId: entityId ?? null,
      companyId: extra.companyId !== undefined ? extra.companyId : req?.company?.id ?? null,
      userId: extra.userId !== undefined ? extra.userId : req?.user?.id ?? null,
      oldValue: json(extra.old), newValue: json(extra.new), reason: extra.reason ?? null,
      ip: req?.ip ?? null, userAgent: req?.get?.("user-agent")?.slice(0, 200) ?? null,
    },
  });
}

export async function notify(userIds: (number | null | undefined)[], data: { companyId?: number | null; type: string; title: string; body?: string; link?: string; dedupeKey?: string }) {
  const ids = [...new Set(userIds.filter((x): x is number => typeof x === "number"))];
  for (const userId of ids) {
    if (data.dedupeKey && (await prisma.notification.findFirst({ where: { userId, dedupeKey: data.dedupeKey } }))) continue;
    await prisma.notification.create({ data: { userId, companyId: data.companyId ?? null, type: data.type, title: data.title, body: data.body, link: data.link, dedupeKey: data.dedupeKey } });
  }
}

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

export type CompanySettings = {
  overloadPct: number; healthyPct: number; underPct: number;
  tempPasswordHours: number; sessionTimeoutMinutes: number; enforceAdminMfa: boolean;
  aiEnabled: boolean; allowOverlappingTimers: boolean; lockApprovedWeeks: boolean;
  invitationDays: number; taskKey: string;
};
export const DEFAULT_SETTINGS: CompanySettings = {
  overloadPct: 100, healthyPct: 80, underPct: 60, tempPasswordHours: 72, sessionTimeoutMinutes: 480, enforceAdminMfa: false,
  aiEnabled: true, allowOverlappingTimers: false, lockApprovedWeeks: true, invitationDays: 7, taskKey: "TP",
};
export const companySettings = (c: { settings: string }): CompanySettings => ({ ...DEFAULT_SETTINGS, ...parseJson<Partial<CompanySettings>>(c.settings, {}) });
