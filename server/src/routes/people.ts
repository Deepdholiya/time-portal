import { Router, type Request } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma, audit, notify, companySettings, parseJson } from "../db.js";
import { HttpError, can, cid, requirePerm, tempPassword, uid } from "../auth.js";
import { FEATURES, getPermissions, rolePermissions, type Feature } from "../permissions.js";
import { appUrl, sendMail } from "../mail.js";

export const peopleRouter = Router();
const canInvite = requirePerm("people", "invite");
const canManage = requirePerm("people", "manage");
const ROLE = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]);

async function member(req: Request, userId: number) {
  const m = await prisma.membership.findUnique({ where: { companyId_userId: { companyId: cid(req), userId } }, include: { user: true, team: true } });
  if (!m) throw new HttpError(404, "Person not found in this company");
  return m;
}

// ---- Directory (everyone; confidential fields need full directory access) ----
peopleRouter.get("/", async (req, res) => {
  const q = z.object({ teamId: z.coerce.number().int().optional(), role: z.string().optional(), status: z.string().optional(), projectId: z.coerce.number().int().optional(), q: z.string().optional() }).parse(req.query);
  const full = can(req, "directory", "full");
  const fin = can(req, "financials", "view");
  const members = await prisma.membership.findMany({
    where: {
      companyId: cid(req),
      ...(q.teamId ? { teamId: q.teamId } : {}),
      user: {
        ...(q.role ? { role: { in: q.role.split(",") } } : {}),
        ...(q.status ? { status: { in: q.status.split(",") } } : full ? {} : { status: "ACTIVE" }),
        ...(q.projectId ? { projectRoles: { some: { projectId: q.projectId } } } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q } }, { email: { contains: q.q } }, { title: { contains: q.q } }] } : {}),
      },
    },
    include: { team: true, user: { include: { projectRoles: { where: { project: { companyId: cid(req) } }, select: { project: { select: { id: true, name: true, color: true } } } } } } },
    orderBy: { user: { name: "asc" } },
  });
  res.json(members.map(({ user: u, team, allProjects }) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, status: u.status, team: team ? { id: team.id, name: team.name, color: team.color } : null,
    location: u.location,
    ...(full ? { phone: u.phone, weeklyCapacity: u.weeklyCapacity, allProjects, projects: u.projectRoles.map((r) => r.project), lastLoginAt: u.lastLoginAt } : {}),
    ...(fin ? { billRate: u.billRate } : {}),
    ...(req.user!.role === "ADMIN" ? { costRate: u.costRate } : {}),
  })));
});

// ---- User management (admins and anyone with people=manage) ----
peopleRouter.get("/users", canInvite, async (req, res) => {
  const members = await prisma.membership.findMany({
    where: { companyId: cid(req) },
    include: {
      team: true,
      user: {
        include: {
          memberships: { include: { company: { select: { id: true, name: true, color: true } } } },
          sessions: { where: { revokedAt: null }, select: { id: true } },
          projectRoles: { where: { project: { companyId: cid(req) } }, select: { projectId: true } },
        },
      },
    },
    orderBy: { user: { name: "asc" } },
  });
  res.json(members.map(({ user: u, team, allProjects }) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, phone: u.phone, status: u.status, weeklyCapacity: u.weeklyCapacity,
    costRate: req.user!.role === "ADMIN" ? u.costRate : undefined, billRate: can(req, "financials", "view") ? u.billRate : undefined,
    team: team ? { id: team.id, name: team.name } : null, allProjects, projectIds: u.projectRoles.map((r) => r.projectId),
    companies: u.memberships.map((m) => m.company), lastLoginAt: u.lastLoginAt, activeSessions: u.sessions.length, mfaEnabled: u.mfaEnabled,
    mustChangePassword: u.mustChangePassword, createdAt: u.createdAt,
  })));
});

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: ROLE.default("EMPLOYEE"),
  title: z.string().trim().max(100).nullish(),
  teamId: z.number().int().nullish(),
  weeklyCapacity: z.number().min(0).max(80).default(40),
  allProjects: z.boolean().default(false),
  projectIds: z.array(z.number().int()).default([]),
});

async function deliverInvite(req: Request, inv: { id: number; email: string; name: string; role: string }, password: string, expiresAt: Date) {
  const company = req.company!;
  const body = (pw: string) =>
    `Hi ${inv.name},\n\n${req.user!.name} invited you to ${company.name} on Time Portal as ${inv.role.toLowerCase()}.\n\nSign in at: ${appUrl()}/login\nEmail: ${inv.email}\nTemporary password: ${pw}\n\nThe temporary password works until ${expiresAt.toUTCString()}. You'll be asked to choose your own password the first time you sign in, and the temporary one stops working after that.`;
  await sendMail({ companyId: company.id, kind: "INVITATION", to: inv.email, subject: `You're invited to ${company.name} on Time Portal`, body: body(password), logBody: body("•••••• (shown once to the inviter)"), sentById: uid(req) });
}

async function createInvite(req: Request, d: z.infer<typeof inviteSchema>) {
  if (d.role === "ADMIN" && req.user!.role !== "ADMIN") throw new HttpError(403, "Only admins can invite admins");
  if (d.teamId && !(await prisma.team.findFirst({ where: { id: d.teamId, companyId: cid(req) } }))) throw new HttpError(400, "Team not found");
  const settings = companySettings(req.company!);
  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  // Someone who already has an account elsewhere just joins this company.
  if (existing && existing.status !== "INVITED") {
    if (await prisma.membership.findUnique({ where: { companyId_userId: { companyId: cid(req), userId: existing.id } } })) throw new HttpError(409, `${existing.name} is already in this company`);
    await prisma.membership.create({ data: { companyId: cid(req), userId: existing.id, teamId: d.teamId ?? null, allProjects: d.allProjects } });
    for (const projectId of d.projectIds) await prisma.projectMember.create({ data: { projectId, userId: existing.id } }).catch(() => undefined);
    const inv = await prisma.invitation.create({ data: { companyId: cid(req), userId: existing.id, email: d.email, name: existing.name, role: existing.role, title: d.title ?? null, teamId: d.teamId ?? null, weeklyCapacity: d.weeklyCapacity, allProjects: d.allProjects, projectIds: JSON.stringify(d.projectIds), status: "ACCEPTED", acceptedAt: new Date(), expiresAt: new Date(), invitedById: uid(req) } });
    await notify([existing.id], { companyId: cid(req), type: "ACCESS_CHANGED", title: `You were added to ${req.company!.name}`, link: "/" });
    await audit(req, "member_added", "user", existing.id, { new: { companyId: cid(req) } });
    return { invitation: inv, tempPassword: null, existing: true };
  }
  if (existing) throw new HttpError(409, `${d.email} already has a pending invitation. Resend it instead.`);
  const password = tempPassword();
  const expiresAt = new Date(Date.now() + settings.tempPasswordHours * 3600_000);
  const user = await prisma.user.create({
    data: { name: d.name, email: d.email, role: d.role, title: d.title ?? null, weeklyCapacity: d.weeklyCapacity, status: "INVITED", mustChangePassword: true, tempPasswordExpiresAt: expiresAt, passwordHash: await bcrypt.hash(password, 10), lastCompanyId: cid(req) },
  });
  await prisma.membership.create({ data: { companyId: cid(req), userId: user.id, teamId: d.teamId ?? null, allProjects: d.allProjects } });
  for (const projectId of d.projectIds) await prisma.projectMember.create({ data: { projectId, userId: user.id } }).catch(() => undefined);
  const inv = await prisma.invitation.create({
    data: { companyId: cid(req), userId: user.id, email: d.email, name: d.name, role: d.role, title: d.title ?? null, teamId: d.teamId ?? null, weeklyCapacity: d.weeklyCapacity, allProjects: d.allProjects, projectIds: JSON.stringify(d.projectIds), expiresAt, invitedById: uid(req) },
  });
  await deliverInvite(req, inv, password, expiresAt);
  await audit(req, "invitation_sent", "invitation", inv.id, { new: { email: d.email, role: d.role } });
  return { invitation: inv, tempPassword: password, existing: false };
}

const inviteStatus = (i: { status: string; expiresAt: Date }) => (i.status === "PENDING" && i.expiresAt < new Date() ? "EXPIRED" : i.status);

peopleRouter.get("/invitations", canInvite, async (req, res) => {
  const rows = await prisma.invitation.findMany({ where: { companyId: cid(req) }, include: { invitedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  const teams = new Map((await prisma.team.findMany({ where: { companyId: cid(req) } })).map((t) => [t.id, t.name]));
  res.json(rows.map((i) => ({ ...i, status: inviteStatus(i), team: i.teamId ? teams.get(i.teamId) ?? null : null, projectIds: parseJson<number[]>(i.projectIds, []) })));
});

peopleRouter.post("/invitations", canInvite, async (req, res) => {
  res.status(201).json(await createInvite(req, inviteSchema.parse(req.body)));
});

// Bulk invite from CSV: name,email,role,team,title (header row optional).
peopleRouter.post("/invitations/bulk", canInvite, async (req, res) => {
  const { csv } = z.object({ csv: z.string().max(200_000) }).parse(req.body);
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0]?.toLowerCase().includes("email")) lines.shift();
  if (lines.length > 200) throw new HttpError(400, "Invite at most 200 people at a time");
  const teams = await prisma.team.findMany({ where: { companyId: cid(req) } });
  const results: { row: number; email: string; ok: boolean; message: string; tempPassword?: string | null }[] = [];
  for (const [i, line] of lines.entries()) {
    const [name, email, role, team, title] = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    try {
      const teamId = team ? teams.find((t) => t.name.toLowerCase() === team.toLowerCase())?.id ?? null : null;
      const r = await createInvite(req, inviteSchema.parse({ name, email, role: (role || "EMPLOYEE").toUpperCase(), teamId, title: title || null }));
      results.push({ row: i + 1, email, ok: true, message: r.existing ? "Added existing account" : "Invited", tempPassword: r.tempPassword });
    } catch (e) {
      results.push({ row: i + 1, email: email ?? "", ok: false, message: e instanceof z.ZodError ? e.issues.map((x) => x.message).join(", ") : (e as Error).message });
    }
  }
  res.json(results);
});

// Resend issues a fresh temporary password (the old one stops working) and extends the expiry.
peopleRouter.post("/invitations/:id/resend", canInvite, async (req, res) => {
  const inv = await prisma.invitation.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) } });
  if (!inv || !inv.userId) throw new HttpError(404, "Invitation not found");
  if (inv.status === "ACCEPTED") throw new HttpError(409, "This invitation was already accepted");
  const settings = companySettings(req.company!);
  const password = tempPassword();
  const expiresAt = new Date(Date.now() + settings.tempPasswordHours * 3600_000);
  await prisma.user.update({ where: { id: inv.userId }, data: { passwordHash: await bcrypt.hash(password, 10), tempPasswordExpiresAt: expiresAt, status: "INVITED", mustChangePassword: true } });
  await prisma.invitation.update({ where: { id: inv.id }, data: { status: "PENDING", expiresAt, sentCount: { increment: 1 } } });
  await deliverInvite(req, inv, password, expiresAt);
  await audit(req, "invitation_resent", "invitation", inv.id, { new: { email: inv.email } });
  res.json({ tempPassword: password, expiresAt });
});

peopleRouter.post("/invitations/:id/revoke", canInvite, async (req, res) => {
  const inv = await prisma.invitation.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) } });
  if (!inv) throw new HttpError(404, "Invitation not found");
  if (inv.status === "ACCEPTED") throw new HttpError(409, "This invitation was already accepted. Deactivate the person instead.");
  await prisma.invitation.update({ where: { id: inv.id }, data: { status: "REVOKED" } });
  if (inv.userId) {
    await prisma.user.update({ where: { id: inv.userId }, data: { status: "DEACTIVATED", tempPasswordExpiresAt: new Date() } });
    await prisma.session.updateMany({ where: { userId: inv.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit(req, "invitation_revoked", "invitation", inv.id, { old: { status: inv.status }, new: { status: "REVOKED" } });
  res.json({ ok: true });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: ROLE.optional(),
  title: z.string().trim().max(100).nullish(),
  phone: z.string().trim().max(40).nullish(),
  location: z.string().trim().max(80).nullish(),
  weeklyCapacity: z.number().min(0).max(80).optional(),
  costRate: z.number().min(0).nullish(),
  billRate: z.number().min(0).nullish(),
  teamId: z.number().int().nullish(),
  allProjects: z.boolean().optional(),
  projectIds: z.array(z.number().int()).optional(),
  companyIds: z.array(z.number().int()).optional(),
});

peopleRouter.put("/:id", canManage, async (req, res) => {
  const m = await member(req, Number(req.params.id));
  const d = updateSchema.parse(req.body);
  const isAdmin = req.user!.role === "ADMIN";
  if (d.role && d.role !== m.user.role) {
    if (!isAdmin) throw new HttpError(403, "Only admins can change roles");
    if (m.userId === uid(req)) throw new HttpError(400, "You can't change your own role");
  }
  if (d.costRate !== undefined && !isAdmin) throw new HttpError(403, "Only admins can set cost rates");
  if (d.billRate !== undefined && !can(req, "financials", "view")) throw new HttpError(403, "You can't set bill rates");
  const before = { role: m.user.role, title: m.user.title, weeklyCapacity: m.user.weeklyCapacity, teamId: m.teamId, allProjects: m.allProjects, costRate: m.user.costRate, billRate: m.user.billRate };
  await prisma.user.update({
    where: { id: m.userId },
    data: { name: d.name, role: d.role, title: d.title, phone: d.phone, location: d.location, weeklyCapacity: d.weeklyCapacity, costRate: d.costRate, billRate: d.billRate },
  });
  await prisma.membership.update({ where: { companyId_userId: { companyId: cid(req), userId: m.userId } }, data: { teamId: d.teamId === undefined ? undefined : d.teamId, allProjects: d.allProjects } });
  if (d.projectIds) {
    await prisma.projectMember.deleteMany({ where: { userId: m.userId, project: { companyId: cid(req) } } });
    for (const projectId of new Set(d.projectIds)) await prisma.projectMember.create({ data: { projectId, userId: m.userId } }).catch(() => undefined);
  }
  if (d.companyIds) {
    if (!isAdmin) throw new HttpError(403, "Only admins can change company membership");
    const current = (await prisma.membership.findMany({ where: { userId: m.userId } })).map((x) => x.companyId);
    for (const c of d.companyIds.filter((c) => !current.includes(c))) await prisma.membership.create({ data: { companyId: c, userId: m.userId } });
    const remove = current.filter((c) => !d.companyIds!.includes(c) && c !== cid(req));
    if (remove.length) await prisma.membership.deleteMany({ where: { userId: m.userId, companyId: { in: remove } } });
  }
  await audit(req, "user_updated", "user", m.userId, { old: before, new: d });
  if (d.role && d.role !== m.user.role) await notify([m.userId], { companyId: cid(req), type: "ACCESS_CHANGED", title: `Your role is now ${d.role.toLowerCase()}`, link: "/profile" });
  res.json({ ok: true });
});

peopleRouter.post("/:id/status", canManage, async (req, res) => {
  const m = await member(req, Number(req.params.id));
  const { status } = z.object({ status: z.enum(["ACTIVE", "DEACTIVATED"]) }).parse(req.body);
  if (m.userId === uid(req)) throw new HttpError(400, "You can't deactivate yourself");
  if (m.user.role === "ADMIN" && req.user!.role !== "ADMIN") throw new HttpError(403, "Only admins can change another admin");
  await prisma.user.update({ where: { id: m.userId }, data: { status } });
  if (status === "DEACTIVATED") await prisma.session.updateMany({ where: { userId: m.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(req, status === "ACTIVE" ? "user_reactivated" : "user_deactivated", "user", m.userId, { old: { status: m.user.status }, new: { status } });
  res.json({ ok: true });
});

// Issue a new temporary password; the person must set their own at next sign-in.
peopleRouter.post("/:id/reset-password", canManage, async (req, res) => {
  const m = await member(req, Number(req.params.id));
  if (m.user.role === "ADMIN" && req.user!.role !== "ADMIN") throw new HttpError(403, "Only admins can reset an admin's password");
  const password = tempPassword();
  const expiresAt = new Date(Date.now() + companySettings(req.company!).tempPasswordHours * 3600_000);
  await prisma.user.update({ where: { id: m.userId }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, tempPasswordExpiresAt: expiresAt, failedLogins: 0, lockedUntil: null } });
  await prisma.session.updateMany({ where: { userId: m.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  const body = (pw: string) => `Hi ${m.user.name},\n\n${req.user!.name} reset your Time Portal password.\n\nSign in at ${appUrl()}/login with this temporary password: ${pw}\nYou'll choose a new password right after signing in.`;
  await sendMail({ companyId: cid(req), kind: "PASSWORD_RESET", to: m.user.email, subject: "Your Time Portal password was reset", body: body(password), logBody: body("••••••"), sentById: uid(req) });
  await audit(req, "password_force_reset", "user", m.userId);
  res.json({ tempPassword: password });
});

peopleRouter.get("/:id/sessions", canManage, async (req, res) => {
  const m = await member(req, Number(req.params.id));
  res.json(await prisma.session.findMany({ where: { userId: m.userId, revokedAt: null }, select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true }, orderBy: { lastSeenAt: "desc" } }));
});

peopleRouter.post("/:id/revoke-sessions", canManage, async (req, res) => {
  const m = await member(req, Number(req.params.id));
  const r = await prisma.session.updateMany({ where: { userId: m.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(req, "sessions_revoked", "user", m.userId, { new: { count: r.count } });
  res.json({ revoked: r.count });
});

// Per-person access overrides on top of the role.
peopleRouter.get("/:id/permissions", canManage, async (req, res) => {
  const m = await member(req, Number(req.params.id));
  const overrides = await prisma.userPermission.findMany({ where: { companyId: cid(req), userId: m.userId } });
  res.json({ role: await rolePermissions(cid(req), m.user.role), effective: await getPermissions(cid(req), m.user), overrides: Object.fromEntries(overrides.map((o) => [o.feature, o.level])) });
});

peopleRouter.put("/:id/permissions", canManage, async (req, res) => {
  const m = await member(req, Number(req.params.id));
  if (m.user.role === "ADMIN") throw new HttpError(400, "Admins always have full access");
  const overrides = z.record(z.string(), z.string().nullable()).parse(req.body);
  const before = await getPermissions(cid(req), m.user);
  for (const [feature, level] of Object.entries(overrides)) {
    const f = FEATURES[feature as Feature];
    if (!f) continue;
    if (level === null) await prisma.userPermission.deleteMany({ where: { companyId: cid(req), userId: m.userId, feature } });
    else if ((f.levels as readonly string[]).includes(level)) {
      await prisma.userPermission.upsert({ where: { companyId_userId_feature: { companyId: cid(req), userId: m.userId, feature } }, update: { level }, create: { companyId: cid(req), userId: m.userId, feature, level } });
    }
  }
  const after = await getPermissions(cid(req), m.user);
  await audit(req, "user_access_changed", "user", m.userId, { old: before, new: after });
  await notify([m.userId], { companyId: cid(req), type: "ACCESS_CHANGED", title: "Your access was updated", link: "/profile" });
  res.json(after);
});

// ---- Teams ----
peopleRouter.get("/teams/all", async (req, res) => {
  const teams = await prisma.team.findMany({ where: { companyId: cid(req) }, include: { members: { select: { user: { select: { id: true, name: true } } } } }, orderBy: { name: "asc" } });
  res.json(teams.map((t) => ({ id: t.id, name: t.name, color: t.color, members: t.members.map((m) => m.user) })));
});

peopleRouter.post("/teams", requirePerm("projects", "manage"), async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#5e6ad2") }).parse(req.body);
  if (await prisma.team.findFirst({ where: { companyId: cid(req), name: d.name } })) throw new HttpError(409, "A team with that name exists");
  const t = await prisma.team.create({ data: { companyId: cid(req), ...d } });
  await audit(req, "team_created", "team", t.id, { new: d });
  res.status(201).json(t);
});

peopleRouter.put("/teams/:id", requirePerm("projects", "manage"), async (req, res) => {
  const t = await prisma.team.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) } });
  if (!t) throw new HttpError(404, "Team not found");
  const d = z.object({ name: z.string().trim().min(1).max(60).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), memberIds: z.array(z.number().int()).optional() }).parse(req.body);
  await prisma.team.update({ where: { id: t.id }, data: { name: d.name, color: d.color } });
  if (d.memberIds) {
    await prisma.membership.updateMany({ where: { companyId: cid(req), teamId: t.id }, data: { teamId: null } });
    await prisma.membership.updateMany({ where: { companyId: cid(req), userId: { in: d.memberIds } }, data: { teamId: t.id } });
  }
  await audit(req, "team_updated", "team", t.id, { old: t, new: d });
  res.json({ ok: true });
});

peopleRouter.delete("/teams/:id", requirePerm("projects", "manage"), async (req, res) => {
  const t = await prisma.team.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) } });
  if (!t) throw new HttpError(404, "Team not found");
  await prisma.team.delete({ where: { id: t.id } });
  await audit(req, "team_deleted", "team", t.id, { old: t });
  res.json({ ok: true });
});
