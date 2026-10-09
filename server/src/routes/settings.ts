import { Router } from "express";
import { z } from "zod";
import { prisma, audit, companySettings, parseJson, DEFAULT_SETTINGS } from "../db.js";
import { HttpError, cid, requirePerm, uid } from "../auth.js";
import { FEATURES, ROLES, getMatrix, type Feature } from "../permissions.js";
import { DATE } from "../scope.js";
import { mailConfigured } from "../mail.js";

export const settingsRouter = Router();
const admin = requirePerm("settings", "yes");

// ---- Company settings ----
settingsRouter.get("/company", async (req, res) => {
  const c = req.company!;
  res.json({ ...c, settings: companySettings(c), mailConfigured: mailConfigured(), aiConfigured: !!process.env.ANTHROPIC_API_KEY });
});

const settingsSchema = z.object({
  overloadPct: z.number().min(50).max(300), healthyPct: z.number().min(10).max(200), underPct: z.number().min(0).max(150),
  tempPasswordHours: z.number().int().min(1).max(24 * 30), sessionTimeoutMinutes: z.number().int().min(5).max(60 * 24 * 30),
  enforceAdminMfa: z.boolean(), aiEnabled: z.boolean(), allowOverlappingTimers: z.boolean(), lockApprovedWeeks: z.boolean(),
  autoSubmitTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"), workdayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  requireDescription: z.boolean(), requireTags: z.boolean(), billableEnabled: z.boolean(),
  invitationDays: z.number().int().min(1).max(60), taskKey: z.string().regex(/^[A-Z]{2,5}$/, "Use 2 to 5 capital letters"),
}).partial();

settingsRouter.put("/company", admin, async (req, res) => {
  const c = req.company!;
  const d = z.object({
    workWeek: z.string().regex(/^[1-7](,[1-7])*$/).optional(), weekStartsOn: z.number().int().min(1).max(7).optional(),
    hoursPerDay: z.number().min(1).max(24).optional(), timezone: z.string().max(60).optional(), currency: z.string().length(3).optional(),
    country: z.string().max(60).optional(), billingNotes: z.string().max(2000).nullish(), settings: settingsSchema.optional(),
  }).parse(req.body);
  const before = { ...c, settings: companySettings(c) };
  const settings = { ...companySettings(c), ...(d.settings ?? {}) };
  if (settings.underPct > settings.healthyPct || settings.healthyPct > settings.overloadPct) throw new HttpError(400, "Thresholds must go underutilized < healthy < overloaded");
  if (settings.enforceAdminMfa && !req.user!.mfaEnabled) throw new HttpError(400, "Turn on two-factor authentication for yourself before requiring it for admins");
  const { settings: _s, ...rest } = d;
  const updated = await prisma.company.update({ where: { id: c.id }, data: { ...rest, settings: JSON.stringify(settings) } });
  await audit(req, "company_settings_updated", "company", c.id, { old: before, new: { ...rest, settings } });
  res.json({ ...updated, settings });
});

// ---- Roles & permissions ----
settingsRouter.get("/permissions", admin, async (req, res) => {
  res.json({ features: FEATURES, roles: ROLES, matrix: await getMatrix(cid(req)) });
});

settingsRouter.put("/permissions", admin, async (req, res) => {
  const d = z.object({ role: z.enum(["MANAGER", "EMPLOYEE"]), feature: z.string(), level: z.string() }).parse(req.body);
  const f = FEATURES[d.feature as Feature];
  if (!f || !(f.levels as readonly string[]).includes(d.level)) throw new HttpError(400, "Unknown permission level");
  if (d.role === "MANAGER" && ["companies"].includes(d.feature) && d.level !== "no") throw new HttpError(400, "Managers can't be given company management");
  const before = (await getMatrix(cid(req)))[d.role][d.feature as Feature];
  await prisma.rolePermission.upsert({
    where: { companyId_role_feature: { companyId: cid(req), role: d.role, feature: d.feature } },
    update: { level: d.level }, create: { companyId: cid(req), role: d.role, feature: d.feature, level: d.level },
  });
  await audit(req, "permission_changed", "permission", null, { old: { role: d.role, feature: d.feature, level: before }, new: { role: d.role, feature: d.feature, level: d.level } });
  res.json(await getMatrix(cid(req)));
});

// ---- Holidays ----
settingsRouter.get("/holidays", async (req, res) => {
  res.json(await prisma.holiday.findMany({ where: { companyId: cid(req) }, orderBy: { date: "asc" } }));
});
settingsRouter.post("/holidays", admin, async (req, res) => {
  const d = z.object({ date: DATE, name: z.string().trim().min(1).max(80) }).parse(req.body);
  const h = await prisma.holiday.create({ data: { companyId: cid(req), ...d } });
  await audit(req, "holiday_added", "holiday", h.id, { new: d });
  res.status(201).json(h);
});
settingsRouter.delete("/holidays/:id", admin, async (req, res) => {
  await prisma.holiday.deleteMany({ where: { id: Number(req.params.id), companyId: cid(req) } });
  await audit(req, "holiday_removed", "holiday", Number(req.params.id));
  res.json({ ok: true });
});

// ---- Custom fields ----
settingsRouter.get("/custom-fields", async (req, res) => {
  const rows = await prisma.customField.findMany({ where: { companyId: cid(req) } });
  res.json(rows.map((r) => ({ ...r, options: parseJson<string[]>(r.options, []) })));
});
settingsRouter.post("/custom-fields", admin, async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1).max(60), type: z.enum(["TEXT", "NUMBER", "SELECT", "DATE"]), options: z.array(z.string().trim().min(1).max(60)).max(30).default([]) }).parse(req.body);
  if (d.type === "SELECT" && !d.options.length) throw new HttpError(400, "Add at least one option");
  const f = await prisma.customField.create({ data: { companyId: cid(req), name: d.name, type: d.type, options: JSON.stringify(d.options) } });
  await audit(req, "custom_field_created", "customField", f.id, { new: d });
  res.status(201).json(f);
});
settingsRouter.delete("/custom-fields/:id", admin, async (req, res) => {
  await prisma.customField.deleteMany({ where: { id: Number(req.params.id), companyId: cid(req) } });
  await audit(req, "custom_field_deleted", "customField", Number(req.params.id));
  res.json({ ok: true });
});

// ---- Integrations ----
const KINDS = ["GOOGLE_SSO", "MICROSOFT_SSO", "SLACK", "GOOGLE_CALENDAR", "SMTP"] as const;
settingsRouter.get("/integrations", admin, async (req, res) => {
  const rows = await prisma.integration.findMany({ where: { companyId: cid(req) } });
  res.json(KINDS.map((kind) => {
    const r = rows.find((x) => x.kind === kind);
    const cfg = parseJson<Record<string, string>>(r?.config, {});
    // Secrets never go back to the browser.
    return { kind, enabled: r?.enabled ?? false, config: Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, /secret|token|password/i.test(k) && v ? "••••••" : v])) };
  }));
});
settingsRouter.put("/integrations/:kind", admin, async (req, res) => {
  const kind = z.enum(KINDS).parse(req.params.kind);
  const d = z.object({ enabled: z.boolean(), config: z.record(z.string(), z.string().max(500)).default({}) }).parse(req.body);
  const existing = await prisma.integration.findUnique({ where: { companyId_kind: { companyId: cid(req), kind } } });
  const old = parseJson<Record<string, string>>(existing?.config, {});
  const config = Object.fromEntries(Object.entries(d.config).map(([k, v]) => [k, v === "••••••" ? old[k] ?? "" : v]));
  if (d.enabled && (kind === "GOOGLE_SSO" || kind === "MICROSOFT_SSO") && (!config.clientId || !config.clientSecret)) throw new HttpError(400, "Add the client ID and secret before turning this on");
  await prisma.integration.upsert({ where: { companyId_kind: { companyId: cid(req), kind } }, update: { enabled: d.enabled, config: JSON.stringify(config) }, create: { companyId: cid(req), kind, enabled: d.enabled, config: JSON.stringify(config) } });
  await audit(req, "integration_updated", "integration", null, { old: { kind, enabled: existing?.enabled ?? false }, new: { kind, enabled: d.enabled } });
  res.json({ ok: true });
});

// ---- Automations ----
const TRIGGERS = ["TASK_STATUS", "TASK_OVERDUE", "DUE_SOON", "TIMESHEET_REMINDER"] as const;
settingsRouter.get("/automations", admin, async (req, res) => {
  const rows = await prisma.automation.findMany({ where: { companyId: cid(req) }, orderBy: { createdAt: "asc" } });
  res.json(rows.map((r) => ({ ...r, config: parseJson(r.config, {}) })));
});
settingsRouter.post("/automations", admin, async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1).max(100), trigger: z.enum(TRIGGERS), config: z.record(z.string(), z.unknown()).default({}), enabled: z.boolean().default(true) }).parse(req.body);
  const a = await prisma.automation.create({ data: { companyId: cid(req), name: d.name, trigger: d.trigger, config: JSON.stringify(d.config), enabled: d.enabled } });
  await audit(req, "automation_created", "automation", a.id, { new: d });
  res.status(201).json(a);
});
settingsRouter.put("/automations/:id", admin, async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1).max(100).optional(), config: z.record(z.string(), z.unknown()).optional(), enabled: z.boolean().optional() }).parse(req.body);
  const a = await prisma.automation.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) } });
  if (!a) throw new HttpError(404, "Automation not found");
  await prisma.automation.update({ where: { id: a.id }, data: { name: d.name, enabled: d.enabled, config: d.config ? JSON.stringify(d.config) : undefined } });
  await audit(req, "automation_updated", "automation", a.id, { old: a, new: d });
  res.json({ ok: true });
});
settingsRouter.delete("/automations/:id", admin, async (req, res) => {
  await prisma.automation.deleteMany({ where: { id: Number(req.params.id), companyId: cid(req) } });
  res.json({ ok: true });
});

// ---- Audit log (read-only; there is no edit or delete route) ----
const auditQuery = z.object({
  userId: z.coerce.number().int().optional(), action: z.string().optional(), entity: z.string().optional(), q: z.string().optional(),
  from: DATE.optional(), to: DATE.optional(), offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(100),
});
async function auditRows(companyId: number, q: z.infer<typeof auditQuery>, take?: number) {
  const where = {
    companyId,
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.action ? { action: { in: q.action.split(",") } } : {}),
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.from || q.to ? { createdAt: { gte: q.from ? new Date(q.from + "T00:00:00") : undefined, lte: q.to ? new Date(q.to + "T23:59:59") : undefined } } : {}),
    ...(q.q ? { OR: [{ oldValue: { contains: q.q } }, { newValue: { contains: q.q } }, { reason: { contains: q.q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, skip: take ? 0 : q.offset, take: take ?? q.limit }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total };
}
settingsRouter.get("/audit", requirePerm("audit", "yes"), async (req, res) => {
  const q = auditQuery.parse(req.query);
  const { rows, total } = await auditRows(cid(req), q);
  const actions = await prisma.auditLog.findMany({ where: { companyId: cid(req) }, distinct: ["action"], select: { action: true } });
  res.json({ total, actions: actions.map((a) => a.action).sort(), rows: rows.map((r) => ({ ...r, company: req.company!.name })) });
});
settingsRouter.get("/audit/export.csv", requirePerm("audit", "yes"), async (req, res) => {
  const q = auditQuery.parse(req.query);
  const { rows } = await auditRows(cid(req), q, 10000);
  const esc = (v: unknown) => { const s = String(v ?? ""); const t = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines = ["Timestamp,Actor,Company,Action,Object,Object ID,Old value,New value,Reason,IP,Device"];
  for (const r of rows) lines.push([r.createdAt.toISOString(), r.user?.name ?? "System", req.company!.name, r.action, r.entity, r.entityId, r.oldValue, r.newValue, r.reason, r.ip, r.userAgent].map(esc).join(","));
  await audit(req, "export", "audit", null, { new: { rows: rows.length } });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="audit-log.csv"');
  res.send("﻿" + lines.join("\n"));
});

// ---- Outbox: every email the system sent ----
settingsRouter.get("/outbox", requirePerm("people", "invite"), async (req, res) => {
  res.json(await prisma.emailMessage.findMany({ where: { companyId: cid(req) }, include: { sentBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }));
});

// ---- Templates ----
settingsRouter.get("/templates", async (req, res) => {
  res.json(await prisma.template.findMany({ where: { companyId: cid(req) }, orderBy: { createdAt: "desc" } }));
});
settingsRouter.delete("/templates/:id", requirePerm("projects", "manage"), async (req, res) => {
  await prisma.template.deleteMany({ where: { id: Number(req.params.id), companyId: cid(req) } });
  res.json({ ok: true });
});

// ---- Saved views (any user) ----
settingsRouter.get("/views", async (req, res) => {
  const { page } = z.object({ page: z.string() }).parse(req.query);
  const rows = await prisma.savedView.findMany({ where: { companyId: cid(req), page, OR: [{ userId: uid(req) }, { shared: true }] }, include: { user: { select: { name: true } } }, orderBy: { name: "asc" } });
  res.json(rows.map((r) => ({ ...r, config: parseJson(r.config, {}), mine: r.userId === uid(req) })));
});
settingsRouter.post("/views", async (req, res) => {
  const d = z.object({ page: z.string().max(40), name: z.string().trim().min(1).max(60), config: z.record(z.string(), z.unknown()), shared: z.boolean().default(false) }).parse(req.body);
  const v = await prisma.savedView.create({ data: { companyId: cid(req), userId: uid(req), page: d.page, name: d.name, config: JSON.stringify(d.config), shared: d.shared } });
  res.status(201).json({ ...v, config: d.config, mine: true });
});
settingsRouter.delete("/views/:id", async (req, res) => {
  await prisma.savedView.deleteMany({ where: { id: Number(req.params.id), companyId: cid(req), userId: uid(req) } });
  res.json({ ok: true });
});

export const defaults = DEFAULT_SETTINGS;
