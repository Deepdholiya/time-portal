import { Router } from "express";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { HttpError, requirePerm } from "../auth.js";
import { FEATURES, ROLES, getMatrix, type Feature } from "../permissions.js";

export const settingsRouter = Router();
const canManage = requirePerm("managePeople", "yes");

settingsRouter.get("/permissions", canManage, async (_req, res) => {
  res.json({ roles: ROLES, features: FEATURES, matrix: await getMatrix() });
});

settingsRouter.put("/permissions", canManage, async (req, res) => {
  const { role, feature, level } = z.object({ role: z.enum(ROLES), feature: z.string(), level: z.string() }).parse(req.body);
  const f = FEATURES[feature as Feature];
  if (!f || !(f.levels as readonly string[]).includes(level)) throw new HttpError(400, "Unknown permission");
  if (role === "ADMIN") throw new HttpError(400, "Admins always have full access");
  await prisma.rolePermission.upsert({ where: { role_feature: { role, feature } }, create: { role, feature, level }, update: { level } });
  await audit(req.user!.id, "permission_changed", "rolePermission", null, { role, feature, level });
  res.json({ matrix: await getMatrix() });
});

settingsRouter.get("/audit", canManage, async (_req, res) => {
  const logs = await prisma.auditLog.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  res.json(logs);
});
