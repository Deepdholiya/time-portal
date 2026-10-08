import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { generateSecret, keyUri, verifyTotp } from "../totp.js";
import QRCode from "qrcode";
import { prisma, audit, notify, companySettings, parseJson } from "../db.js";
import { HttpError, clearSession, loadSession, randomToken, startSession } from "../auth.js";
import { appUrl, mailConfigured, sendMail } from "../mail.js";

export const authRouter = Router();

const PASSWORD = z.string().min(8, "Use at least 8 characters").max(200);
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

// Simple in-memory rate limit per IP for credential endpoints.
const hits = new Map<string, number[]>();
function rateLimit(req: Request, key: string, max = 10, windowMs = 60_000) {
  const k = `${key}:${req.ip}`;
  const now = Date.now();
  const list = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(k, list);
  if (list.length > max) throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
}

async function companyFor(userId: number, lastCompanyId: number | null) {
  const m = await prisma.membership.findMany({ where: { userId }, select: { companyId: true } });
  if (lastCompanyId && m.some((x) => x.companyId === lastCompanyId)) return lastCompanyId;
  return m[0]?.companyId ?? null;
}

authRouter.post("/login", async (req, res) => {
  rateLimit(req, "login");
  const { email, password } = z.object({ email: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const fail = async (msg = "Wrong email or password") => {
    if (user) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
      await audit(req, "login_failed", "user", user.id, { userId: user.id, companyId: user.lastCompanyId, new: { attempts: failed } });
    }
    throw new HttpError(401, msg);
  };
  if (!user) return fail();
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(423, `Too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString()}.`);
  if (!(await bcrypt.compare(password, user.passwordHash))) return fail();
  if (user.status === "DEACTIVATED") throw new HttpError(403, "This account is deactivated. Contact your admin.");
  if (user.status === "INVITED") {
    const inv = await prisma.invitation.findFirst({ where: { userId: user.id }, orderBy: { id: "desc" } });
    if (!inv || inv.status === "REVOKED") throw new HttpError(403, "This invitation was revoked. Ask your admin for a new one.");
    if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) throw new HttpError(403, "Your temporary password has expired. Ask your admin to resend the invitation.");
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const companyId = await companyFor(user.id, user.lastCompanyId);
  await startSession(req, res, user.id, { mfaPassed: !user.mfaEnabled, companyId });
  await audit(req, "login", "user", user.id, { userId: user.id, companyId });
  res.json({ mfaRequired: user.mfaEnabled, mustChangePassword: user.mustChangePassword });
});

authRouter.post("/mfa/verify", async (req, res) => {
  rateLimit(req, "mfa");
  const { session, user } = await loadSession(req, "mfa");
  const { code } = z.object({ code: z.string().trim() }).parse(req.body);
  if (!user.mfaSecret || !verifyTotp(code, user.mfaSecret)) {
    await audit(req, "mfa_failed", "user", user.id);
    throw new HttpError(401, "That code didn't match. Check your authenticator app and try again.");
  }
  await prisma.session.update({ where: { id: session.id }, data: { mfaPassed: true } });
  await audit(req, "mfa_passed", "user", user.id);
  res.json({ ok: true, mustChangePassword: user.mustChangePassword });
});

// First login after an invitation, or after an admin forced a reset: replace the temporary password.
authRouter.post("/set-password", async (req, res) => {
  const { user } = await loadSession(req, "password");
  if (!user.mustChangePassword) throw new HttpError(400, "Your password is already set");
  const { password } = z.object({ password: PASSWORD }).parse(req.body);
  if (await bcrypt.compare(password, user.passwordHash)) throw new HttpError(400, "Choose a password different from the temporary one");
  const wasInvited = user.status === "INVITED";
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false, tempPasswordExpiresAt: null, status: "ACTIVE", emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  if (wasInvited) {
    const inv = await prisma.invitation.findFirst({ where: { userId: user.id, status: "PENDING" }, orderBy: { id: "desc" } });
    if (inv) {
      await prisma.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await notify([inv.invitedById], { companyId: inv.companyId, type: "INVITATION_ACCEPTED", title: `${user.name} accepted the invitation`, body: `${user.email} is now active`, link: "/admin/users" });
      await audit(req, "invitation_accepted", "invitation", inv.id, { companyId: inv.companyId });
    }
  }
  await audit(req, "password_set", "user", user.id);
  res.json({ ok: true });
});

authRouter.post("/change-password", async (req, res) => {
  const { user } = await loadSession(req, "full");
  const d = z.object({ current: z.string(), next: PASSWORD }).parse(req.body);
  if (!(await bcrypt.compare(d.current, user.passwordHash))) throw new HttpError(400, "Your current password is wrong");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(d.next, 10) } });
  await audit(req, "password_changed", "user", user.id);
  res.json({ ok: true });
});

authRouter.post("/forgot", async (req, res) => {
  rateLimit(req, "forgot", 5);
  const { email } = z.object({ email: z.string().trim().toLowerCase() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  let devLink: string | undefined;
  if (user && user.status !== "DEACTIVATED") {
    const token = randomToken();
    await prisma.passwordReset.create({ data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000) } });
    const link = `${appUrl()}/reset/${token}`;
    await sendMail({ companyId: user.lastCompanyId, kind: "PASSWORD_RESET", to: user.email, subject: "Reset your Time Portal password", body: `Hi ${user.name},\n\nUse this link within an hour to set a new password:\n${link}\n\nIf you didn't ask for this, ignore this email.` });
    await audit(req, "password_reset_requested", "user", user.id, { userId: user.id, companyId: user.lastCompanyId });
    // Without a mail server, show the link in development so the flow can be completed.
    if (!mailConfigured() && process.env.NODE_ENV !== "production") devLink = `/reset/${token}`;
  }
  res.json({ ok: true, devLink });
});

authRouter.get("/reset/:token", async (req, res) => {
  const r = await prisma.passwordReset.findUnique({ where: { token: req.params.token }, include: { user: { select: { email: true, name: true } } } });
  if (!r || r.usedAt || r.expiresAt < new Date()) throw new HttpError(410, "This reset link has expired or was already used");
  res.json({ email: r.user.email, name: r.user.name });
});

authRouter.post("/reset/:token", async (req, res) => {
  const { password } = z.object({ password: PASSWORD }).parse(req.body);
  const r = await prisma.passwordReset.findUnique({ where: { token: req.params.token } });
  if (!r || r.usedAt || r.expiresAt < new Date()) throw new HttpError(410, "This reset link has expired or was already used");
  await prisma.$transaction([
    prisma.user.update({ where: { id: r.userId }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false, failedLogins: 0, lockedUntil: null } }),
    prisma.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: r.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(req, "password_reset", "user", r.userId, { userId: r.userId, companyId: null });
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  try {
    const { session } = await loadSession(req, "mfa");
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await audit(req, "logout", "user", session.userId);
  } catch { /* already signed out */ }
  clearSession(res);
  res.json({ ok: true });
});

authRouter.post("/logout-all", async (req, res) => {
  const { user } = await loadSession(req, "full");
  const r = await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(req, "logout_all", "user", user.id, { new: { sessions: r.count } });
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  const { user, company } = await loadSession(req, "password");
  const memberships = await prisma.membership.findMany({ where: { userId: user.id, company: { status: "ACTIVE" } }, include: { company: true, team: true } });
  let companies = memberships.map((m) => m.company);
  if (user.role === "ADMIN") companies = await prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
  const settings = company ? companySettings(company) : null;
  const team = memberships.find((m) => m.companyId === company?.id)?.team ?? null;
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, title: user.title, phone: user.phone, weeklyCapacity: user.weeklyCapacity, mfaEnabled: user.mfaEnabled, mustChangePassword: user.mustChangePassword, status: user.status, team },
    permissions: req.perms ?? null,
    company: company ? { ...company, settings } : null,
    companies: companies.map((c) => ({ id: c.id, name: c.name, color: c.color, slug: c.slug })),
    mfaSetupRequired: !!(settings?.enforceAdminMfa && user.role === "ADMIN" && !user.mfaEnabled),
  });
});

authRouter.post("/switch-company", async (req, res) => {
  const { session, user } = await loadSession(req, "full");
  const { companyId } = z.object({ companyId: z.number().int() }).parse(req.body);
  const member = await prisma.membership.findUnique({ where: { companyId_userId: { companyId, userId: user.id } } });
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.status !== "ACTIVE" || (!member && user.role !== "ADMIN")) throw new HttpError(403, "You don't have access to that company");
  await prisma.session.update({ where: { id: session.id }, data: { companyId } });
  await prisma.user.update({ where: { id: user.id }, data: { lastCompanyId: companyId } });
  await audit(req, "company_switched", "company", companyId, { companyId });
  res.json({ ok: true });
});

// ----- Active sessions -----
authRouter.get("/sessions", async (req, res) => {
  const { user, session } = await loadSession(req, "full");
  const rows = await prisma.session.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { lastSeenAt: "desc" } });
  res.json(rows.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === session.id })));
});

authRouter.delete("/sessions/:id", async (req, res) => {
  const { user } = await loadSession(req, "full");
  const s = await prisma.session.findUnique({ where: { id: String(req.params.id) } });
  if (!s || s.userId !== user.id) throw new HttpError(404, "Session not found");
  await prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
  await audit(req, "session_revoked", "user", user.id);
  res.json({ ok: true });
});

// ----- MFA (TOTP) -----
authRouter.post("/mfa/setup", async (req, res) => {
  const { user } = await loadSession(req, "full");
  if (user.mfaEnabled) throw new HttpError(400, "Two-factor authentication is already on");
  const secret = generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });
  const uri = keyUri(user.email, "Time Portal", secret);
  res.json({ secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 200 }) });
});

authRouter.post("/mfa/enable", async (req, res) => {
  const { user, session } = await loadSession(req, "full");
  const { code } = z.object({ code: z.string().trim() }).parse(req.body);
  if (!user.mfaSecret || !verifyTotp(code, user.mfaSecret)) throw new HttpError(400, "That code didn't match. Try the newest code in your app.");
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await prisma.session.update({ where: { id: session.id }, data: { mfaPassed: true } });
  await audit(req, "mfa_enabled", "user", user.id);
  res.json({ ok: true });
});

authRouter.post("/mfa/disable", async (req, res) => {
  const { user, company } = await loadSession(req, "full");
  const { password } = z.object({ password: z.string() }).parse(req.body);
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(400, "Your password is wrong");
  if (company && companySettings(company).enforceAdminMfa && user.role === "ADMIN") throw new HttpError(400, "Two-factor authentication is required for admins in this company");
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
  await audit(req, "mfa_disabled", "user", user.id);
  res.json({ ok: true });
});

// ----- SSO (Google / Microsoft OpenID Connect) -----
// Enabled per company under Integrations with a client id and secret. Untested without real credentials.
const PROVIDERS = {
  google: { kind: "GOOGLE_SSO", auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", userinfo: "https://openidconnect.googleapis.com/v1/userinfo" },
  microsoft: { kind: "MICROSOFT_SSO", auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", userinfo: "https://graph.microsoft.com/oidc/userinfo" },
} as const;
type SsoConfig = { clientId?: string; clientSecret?: string };

async function ssoConfig(provider: keyof typeof PROVIDERS) {
  const row = await prisma.integration.findFirst({ where: { kind: PROVIDERS[provider].kind, enabled: true } });
  const cfg = parseJson<SsoConfig>(row?.config, {});
  return cfg.clientId && cfg.clientSecret ? cfg : null;
}

authRouter.get("/sso/providers", async (_req, res) => {
  res.json({ google: !!(await ssoConfig("google")), microsoft: !!(await ssoConfig("microsoft")) });
});

const ssoStates = new Map<string, { provider: string; at: number }>();
authRouter.get("/sso/:provider/start", async (req, res) => {
  const provider = req.params.provider as keyof typeof PROVIDERS;
  const cfg = PROVIDERS[provider] && (await ssoConfig(provider));
  if (!cfg) throw new HttpError(404, "This sign-in method isn't set up");
  const state = randomToken(16);
  ssoStates.set(state, { provider, at: Date.now() });
  const q = new URLSearchParams({ client_id: cfg.clientId!, response_type: "code", scope: "openid email profile", redirect_uri: `${appUrl()}/api/auth/sso/${provider}/callback`, state });
  res.redirect(`${PROVIDERS[provider].auth}?${q}`);
});

authRouter.get("/sso/:provider/callback", async (req, res) => {
  const provider = req.params.provider as keyof typeof PROVIDERS;
  const st = ssoStates.get(String(req.query.state));
  ssoStates.delete(String(req.query.state));
  const cfg = PROVIDERS[provider] && (await ssoConfig(provider));
  if (!cfg || !st || st.provider !== provider || Date.now() - st.at > 10 * 60_000) return res.redirect("/login?error=sso");
  const tokenRes = await fetch(PROVIDERS[provider].token, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: String(req.query.code), client_id: cfg.clientId!, client_secret: cfg.clientSecret!, redirect_uri: `${appUrl()}/api/auth/sso/${provider}/callback`, grant_type: "authorization_code" }),
  });
  const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  if (!tok.access_token) return res.redirect("/login?error=sso");
  const info = (await (await fetch(PROVIDERS[provider].userinfo, { headers: { authorization: `Bearer ${tok.access_token}` } })).json().catch(() => ({}))) as { email?: string };
  const user = info.email ? await prisma.user.findUnique({ where: { email: info.email.toLowerCase() } }) : null;
  if (!user || user.status !== "ACTIVE") return res.redirect("/login?error=sso-account");
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(req, res, user.id, { mfaPassed: !user.mfaEnabled, companyId: await companyFor(user.id, user.lastCompanyId) });
  await audit(req, "login_sso", "user", user.id, { userId: user.id, companyId: user.lastCompanyId, new: { provider } });
  res.redirect("/");
});
