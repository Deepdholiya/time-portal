import { Router } from "express";
import { z } from "zod";
import { prisma, audit } from "../db.js";
import { HttpError, can, cid, requirePerm } from "../auth.js";
import { projectStats } from "../health.js";

export const clientsRouter = Router();

const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(120),
  email: z.string().trim().email().or(z.literal("")).nullish(),
  contactName: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(40).nullish(),
  website: z.string().trim().max(200).nullish(),
  rate: z.number().min(0).nullish(),
  archived: z.boolean().optional(),
});

clientsRouter.get("/", async (req, res) => {
  const fin = can(req, "financials", "view");
  const clients = await prisma.client.findMany({ where: { companyId: cid(req) }, include: { projects: { where: { parentId: null }, select: { id: true, name: true, color: true, status: true, archived: true } } }, orderBy: { name: "asc" } });
  const stats = await projectStats(cid(req));
  res.json(clients.map((c) => {
    const s = c.projects.map((p) => stats.get(p.id)).filter(Boolean);
    return {
      ...c, rate: fin ? c.rate : undefined,
      trackedMinutes: s.reduce((a, x) => a + x!.trackedMinutes, 0),
      revenue: fin ? s.reduce((a, x) => a + x!.revenue, 0) : undefined,
      activeProjects: c.projects.filter((p) => !p.archived && p.status !== "COMPLETED").length,
    };
  }));
});

clientsRouter.post("/", requirePerm("projects", "manage"), async (req, res) => {
  const d = clientSchema.parse(req.body);
  if (await prisma.client.findFirst({ where: { companyId: cid(req), name: d.name } })) throw new HttpError(409, "A client with that name already exists");
  const c = await prisma.client.create({ data: { companyId: cid(req), name: d.name, email: d.email || null, contactName: d.contactName ?? null, phone: d.phone ?? null, website: d.website ?? null, rate: can(req, "financials", "view") ? d.rate ?? null : null } });
  await audit(req, "client_created", "client", c.id, { new: d });
  res.status(201).json(c);
});

clientsRouter.put("/:id", requirePerm("projects", "manage"), async (req, res) => {
  const c = await prisma.client.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) } });
  if (!c) throw new HttpError(404, "Client not found");
  const d = clientSchema.parse(req.body);
  const updated = await prisma.client.update({
    where: { id: c.id },
    data: { name: d.name, email: d.email || null, contactName: d.contactName ?? null, phone: d.phone ?? null, website: d.website ?? null, archived: d.archived, ...(can(req, "financials", "view") ? { rate: d.rate ?? null } : {}) },
  });
  await audit(req, "client_updated", "client", c.id, { old: c, new: updated });
  res.json(updated);
});

clientsRouter.delete("/:id", requirePerm("projects", "manage"), async (req, res) => {
  const c = await prisma.client.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) }, include: { _count: { select: { projects: true } } } });
  if (!c) throw new HttpError(404, "Client not found");
  if (c._count.projects) throw new HttpError(409, `${c.name} has projects. Archive the client instead.`);
  await prisma.client.delete({ where: { id: c.id } });
  await audit(req, "client_deleted", "client", c.id, { old: c });
  res.json({ ok: true });
});
