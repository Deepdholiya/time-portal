import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { COOKIE, HttpError, requireAuth, signSession } from "../auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await audit(user?.id ?? null, "login_failed", "user", user?.id, { email });
    throw new HttpError(401, "Invalid email or password");
  }
  if (!user.active) throw new HttpError(403, "This account is disabled");
  signSession(res, user.id);
  await audit(user.id, "login", "user", user.id);
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const team = req.user!.teamId ? await prisma.team.findUnique({ where: { id: req.user!.teamId } }) : null;
  res.json({ user: { ...req.user, team }, permissions: req.perms });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { current, next } = z.object({ current: z.string(), next: z.string().min(8) }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, "Current password is wrong");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  await audit(user.id, "password_changed", "user", user.id);
  res.json({ ok: true });
});

// ---- Invitation acceptance (public) ----
async function findInvite(token: string) {
  const inv = await prisma.invitation.findUnique({ where: { token } });
  if (!inv) throw new HttpError(404, "This invitation link isn't valid");
  if (inv.status === "REVOKED") throw new HttpError(410, "This invitation was revoked. Ask your admin for a new one");
  if (inv.status === "ACCEPTED") throw new HttpError(410, "This invitation was already used. Sign in instead");
  if (inv.expiresAt < new Date()) throw new HttpError(410, "This invitation has expired. Ask your admin to resend it");
  return inv;
}

authRouter.get("/invite/:token", async (req, res) => {
  const inv = await findInvite(req.params.token);
  const team = inv.teamId ? await prisma.team.findUnique({ where: { id: inv.teamId } }) : null;
  const ids = JSON.parse(inv.projectIds) as number[];
  const projects = inv.allProjects || inv.role === "ADMIN" ? null : await prisma.project.findMany({ where: { id: { in: ids } }, select: { name: true } });
  res.json({ email: inv.email, name: inv.name, role: inv.role, title: inv.title, team: team?.name ?? null, allProjects: inv.allProjects || inv.role === "ADMIN", projects: projects?.map((p) => p.name) ?? [], expiresAt: inv.expiresAt });
});

authRouter.post("/invite/:token/accept", async (req, res) => {
  const { name, password } = z.object({ name: z.string().trim().min(1).max(100), password: z.string().min(8, "Use at least 8 characters") }).parse(req.body);
  const inv = await findInvite(req.params.token);
  if (await prisma.user.findUnique({ where: { email: inv.email } })) throw new HttpError(409, "An account with this email already exists. Sign in instead");
  const ids = JSON.parse(inv.projectIds) as number[];
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name, email: inv.email, role: inv.role, title: inv.title, teamId: inv.teamId, weeklyCapacity: inv.weeklyCapacity, allProjects: inv.allProjects,
        passwordHash: await bcrypt.hash(password, 10), memberships: { create: ids.map((projectId) => ({ projectId })) },
      },
    });
    await tx.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    return u;
  });
  await audit(user.id, "invitation_accepted", "invitation", inv.id, { email: inv.email });
  signSession(res, user.id);
  res.json({ ok: true });
});
