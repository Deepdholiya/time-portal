import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { HttpError, requirePerm } from "../auth.js";
import { ROLES } from "../permissions.js";

export const peopleRouter = Router();
const canManage = requirePerm("managePeople", "yes");

const userSelect = {
  id: true, name: true, email: true, role: true, title: true, weeklyCapacity: true, allProjects: true, active: true, createdAt: true,
  team: { select: { id: true, name: true } },
  memberships: { select: { projectId: true } },
} as const;

peopleRouter.get("/", canManage, async (_req, res) => {
  const users = await prisma.user.findMany({ select: userSelect, orderBy: { name: "asc" } });
  res.json(users.map(({ memberships, ...u }) => ({ ...u, projectIds: memberships.map((m) => m.projectId) })));
});

const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES).default("EMPLOYEE"),
  title: z.string().max(100).nullish(),
  teamId: z.number().int().nullish(),
  weeklyCapacity: z.number().min(0).max(80).default(40),
  allProjects: z.boolean().default(false),
  projectIds: z.array(z.number().int()).default([]),
  active: z.boolean().default(true),
});

// ---- Invitations ----
const INVITE_DAYS = 7;
const inviteSchema = userSchema.omit({ active: true });
const newToken = () => crypto.randomBytes(24).toString("base64url");
const inviteStatus = (i: { status: string; expiresAt: Date }) => (i.status === "PENDING" && i.expiresAt < new Date() ? "EXPIRED" : i.status);
const shapeInvite = (i: Awaited<ReturnType<typeof prisma.invitation.findFirstOrThrow>> & { invitedBy?: { name: string } | null }) => ({
  ...i, projectIds: JSON.parse(i.projectIds) as number[], status: inviteStatus(i),
});

peopleRouter.get("/invitations", canManage, async (_req, res) => {
  const rows = await prisma.invitation.findMany({ include: { invitedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  res.json(rows.map(shapeInvite));
});

// Creates a pending invitation. The link is returned so the admin can send it (no mail server is configured).
peopleRouter.post("/invitations", canManage, async (req, res) => {
  const { projectIds, ...d } = inviteSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: d.email } })) throw new HttpError(409, "Someone with that email already has an account");
  const open = await prisma.invitation.findFirst({ where: { email: d.email, status: "PENDING", expiresAt: { gt: new Date() } } });
  if (open) throw new HttpError(409, "There's already a pending invitation for that email. Resend it instead");
  const inv = await prisma.invitation.create({
    data: { ...d, projectIds: JSON.stringify(projectIds), token: newToken(), expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5), invitedById: req.user!.id },
  });
  await audit(req.user!.id, "invitation_sent", "invitation", inv.id, { email: d.email, role: d.role, projectIds });
  res.status(201).json(shapeInvite(inv));
});

peopleRouter.post("/invitations/:id/resend", canManage, async (req, res) => {
  const id = Number(req.params.id);
  const inv = await prisma.invitation.findUnique({ where: { id } });
  if (!inv || inv.status === "ACCEPTED") throw new HttpError(409, "This invitation was already accepted");
  const updated = await prisma.invitation.update({ where: { id }, data: { status: "PENDING", token: newToken(), expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5) } });
  await audit(req.user!.id, "invitation_resent", "invitation", id, { email: inv.email });
  res.json(shapeInvite(updated));
});

peopleRouter.post("/invitations/:id/revoke", canManage, async (req, res) => {
  const id = Number(req.params.id);
  const inv = await prisma.invitation.findUnique({ where: { id } });
  if (!inv || inv.status !== "PENDING") throw new HttpError(409, "Only pending invitations can be revoked");
  await prisma.invitation.update({ where: { id }, data: { status: "REVOKED" } });
  await audit(req.user!.id, "invitation_revoked", "invitation", id, { email: inv.email });
  res.json({ ok: true });
});

peopleRouter.put("/:id", canManage, async (req, res) => {
  const id = Number(req.params.id);
  const { projectIds, ...d } = userSchema.partial().parse(req.body);
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (id === req.user!.id && (d.role && d.role !== before.role || d.active === false)) throw new HttpError(400, "You can't change your own role or disable yourself");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: d });
    if (projectIds) {
      await tx.projectMember.deleteMany({ where: { userId: id } });
      await tx.projectMember.createMany({ data: projectIds.map((projectId) => ({ projectId, userId: id })) });
    }
  });
  if (d.role && d.role !== before.role) await audit(req.user!.id, "role_changed", "user", id, { from: before.role, to: d.role });
  await audit(req.user!.id, "user_edited", "user", id, { ...d, projectIds });
  res.json({ ok: true });
});

peopleRouter.post("/:id/reset-password", canManage, async (req, res) => {
  const id = Number(req.params.id);
  const tempPassword = crypto.randomBytes(6).toString("base64url");
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(tempPassword, 10) } });
  await audit(req.user!.id, "password_reset", "user", id);
  res.json({ tempPassword });
});

// ---- Teams and clients ----
peopleRouter.post("/teams", canManage, async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body);
  const team = await prisma.team.create({ data: { name } });
  await audit(req.user!.id, "team_created", "team", team.id, { name });
  res.status(201).json(team);
});

peopleRouter.post("/clients", requirePerm("manageProjects", "yes"), async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body);
  const client = await prisma.client.create({ data: { name } });
  await audit(req.user!.id, "client_created", "client", client.id, { name });
  res.status(201).json(client);
});
