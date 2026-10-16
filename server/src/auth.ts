import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { Company } from "@prisma/client";
import { prisma, companySettings } from "./db.js";
import { atLeast, getPermissions, type Feature, type Permissions } from "./permissions.js";

const SECRET = process.env.JWT_SECRET || "dev-secret";
export const COOKIE = "tp_session";

export type AuthUser = { id: number; name: string; email: string; role: string; mustChangePassword: boolean; mfaEnabled: boolean };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser; perms?: Permissions; company?: Company; sessionId?: string }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function startSession(req: Request, res: Response, userId: number, opts: { mfaPassed: boolean; companyId?: number | null }) {
  const id = crypto.randomBytes(24).toString("hex");
  await prisma.session.create({
    data: { id, userId, companyId: opts.companyId ?? null, mfaPassed: opts.mfaPassed, ip: req.ip, userAgent: req.get("user-agent")?.slice(0, 200) },
  });
  const token = jwt.sign({ sid: id }, SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 864e5 });
  return id;
}

export function clearSession(res: Response) { res.clearCookie(COOKIE); }

// Picks the company this request acts in: the session's choice if the user may use it, else their first company.
async function resolveCompany(user: { id: number; role: string }, preferred: number | null) {
  const memberships = await prisma.membership.findMany({ where: { userId: user.id, company: { status: "ACTIVE" } }, select: { companyId: true } });
  const ids = memberships.map((m) => m.companyId);
  if (preferred) {
    if (ids.includes(preferred)) return prisma.company.findUnique({ where: { id: preferred } });
    if (user.role === "ADMIN") { const c = await prisma.company.findUnique({ where: { id: preferred } }); if (c) return c; }
  }
  if (ids.length) return prisma.company.findUnique({ where: { id: ids[0] } });
  if (user.role === "ADMIN") return prisma.company.findFirst({ where: { status: "ACTIVE" }, orderBy: { id: "asc" } });
  return null;
}

// Loads and validates the session. `stage` lets the auth routes reach a session that still owes MFA or a password change.
export async function loadSession(req: Request, stage: "full" | "mfa" | "password" = "full") {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, "Not signed in");
  let sid: string;
  try { sid = (jwt.verify(token, SECRET) as { sid: string }).sid; } catch { throw new HttpError(401, "Your session has expired. Sign in again."); }
  const session = await prisma.session.findUnique({ where: { id: sid }, include: { user: true } });
  if (!session || session.revokedAt) throw new HttpError(401, "You were signed out. Sign in again.");
  const u = session.user;
  if (u.status === "DEACTIVATED") throw new HttpError(401, "This account is deactivated");

  const company = await resolveCompany(u, session.companyId);
  const timeout = company ? companySettings(company).sessionTimeoutMinutes : 480;
  if (Date.now() - session.lastSeenAt.getTime() > timeout * 60_000) {
    await prisma.session.update({ where: { id: sid }, data: { revokedAt: new Date() } });
    throw new HttpError(401, "You were signed out after a period of inactivity");
  }
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) await prisma.session.update({ where: { id: sid }, data: { lastSeenAt: new Date() } });

  if (u.mfaEnabled && !session.mfaPassed && stage !== "mfa") throw new HttpError(401, "Enter your authentication code", "MFA_REQUIRED");
  if (u.mustChangePassword && stage === "full") throw new HttpError(403, "Set a new password to continue", "PASSWORD_CHANGE_REQUIRED");

  req.sessionId = sid;
  req.user = { id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword, mfaEnabled: u.mfaEnabled };
  if (company) {
    req.company = company;
    req.perms = await getPermissions(company.id, u);
  }
  return { session, user: u, company };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  await loadSession(req, "full");
  if (!req.company) throw new HttpError(403, "You aren't a member of any active company. Ask an admin to add you.");
  if (req.user!.role === "ADMIN" && !req.user!.mfaEnabled && companySettings(req.company).enforceAdminMfa) {
    throw new HttpError(403, "Turn on two-factor authentication to continue", "MFA_SETUP_REQUIRED");
  }
  next();
}

export function requirePerm(feature: Feature, level: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.perms || !atLeast(req.perms, feature, level)) throw new HttpError(403, "You don't have permission to do this");
    next();
  };
}

export const can = (req: Request, feature: Feature, level: string) => !!req.perms && atLeast(req.perms, feature, level);
export const cid = (req: Request) => req.company!.id;
export const uid = (req: Request) => req.user!.id;

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");
// Readable temporary password, e.g. "Kite-4821-Moss".
export function tempPassword() {
  const words = ["Kite", "Moss", "Reef", "Pine", "Opal", "Fern", "Dune", "Wren", "Sage", "Lark", "Iris", "Cove"];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${crypto.randomInt(1000, 9999)}-${pick()}`;
}
