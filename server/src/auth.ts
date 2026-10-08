import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { getPermissions, type Feature, type Permissions } from "./permissions.js";

const SECRET = process.env.JWT_SECRET || "dev-secret";
export const COOKIE = "tp_session";

export type AuthUser = { id: number; name: string; email: string; role: string; allProjects: boolean; teamId: number | null };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser; perms?: Permissions }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function signSession(res: Response, userId: number) {
  const token = jwt.sign({ uid: userId }, SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 864e5 });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, "Not signed in");
  let uid: number;
  try { uid = (jwt.verify(token, SECRET) as { uid: number }).uid; } catch { throw new HttpError(401, "Session expired"); }
  const user = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, name: true, email: true, role: true, allProjects: true, teamId: true, active: true } });
  if (!user || !user.active) throw new HttpError(401, "Account disabled");
  req.user = user;
  req.perms = await getPermissions(user.role);
  next();
}

export function requirePerm(feature: Feature, ...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.perms || !allowed.includes(req.perms[feature])) throw new HttpError(403, "You don't have access to this");
    next();
  };
}
