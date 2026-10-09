import { Router } from "express";
import { z } from "zod";
import { prisma, audit, parseJson } from "../db.js";
import { HttpError, can, cid, requirePerm, uid } from "../auth.js";

export const tagsRouter = Router();
const admin = requirePerm("settings", "yes");

const shape = (t: { teamIds: string; _count?: { entries: number } }) => ({ ...t, teamIds: parseJson<number[]>(t.teamIds, []), uses: t._count?.entries ?? 0, _count: undefined });

// Admins (and anyone with ?all=1 and settings access) get every tag; everyone else gets the active tags their team may use.
tagsRouter.get("/", async (req, res) => {
  const all = req.query.all === "1" && can(req, "settings", "yes");
  const tags = await prisma.tag.findMany({ where: { companyId: cid(req), ...(all ? {} : { active: true }) }, include: { _count: { select: { entries: true } } }, orderBy: { name: "asc" } });
  if (all) return res.json(tags.map(shape));
  const asked = Number(req.query.userId) || uid(req);
  const userId = asked !== uid(req) && can(req, "editOthersTime", "yes") ? asked : uid(req);
  const member = await prisma.membership.findUnique({ where: { companyId_userId: { companyId: cid(req), userId } } });
  res.json(tags.map(shape).filter((t) => !t.teamIds.length || (member?.teamId != null && t.teamIds.includes(member.teamId))));
});

const tagSchema = z.object({
  name: z.string().trim().min(1, "Name the tag").max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a color"),
  active: z.boolean().default(true),
  teamIds: z.array(z.number().int()).max(100).default([]),
});

async function checkTeams(companyId: number, teamIds: number[]) {
  if (!teamIds.length) return;
  const n = await prisma.team.count({ where: { companyId, id: { in: teamIds } } });
  if (n !== new Set(teamIds).size) throw new HttpError(400, "One of the teams doesn't exist");
}

async function unique(companyId: number, name: string, id?: number) {
  const clash = await prisma.tag.findFirst({ where: { companyId, name, ...(id ? { id: { not: id } } : {}) } });
  if (clash) throw new HttpError(409, `There's already a tag called "${name}"`);
}

tagsRouter.post("/", admin, async (req, res) => {
  const d = tagSchema.parse(req.body);
  await checkTeams(cid(req), d.teamIds);
  await unique(cid(req), d.name);
  const t = await prisma.tag.create({ data: { companyId: cid(req), name: d.name, color: d.color, active: d.active, teamIds: JSON.stringify(d.teamIds) } });
  await audit(req, "tag_created", "tag", t.id, { new: d });
  res.status(201).json(shape(t));
});

tagsRouter.put("/:id", admin, async (req, res) => {
  const d = tagSchema.partial().parse(req.body);
  const t = await prisma.tag.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) } });
  if (!t) throw new HttpError(404, "Tag not found");
  if (d.teamIds) await checkTeams(cid(req), d.teamIds);
  if (d.name) await unique(cid(req), d.name, t.id);
  const updated = await prisma.tag.update({ where: { id: t.id }, data: { ...d, teamIds: d.teamIds ? JSON.stringify(d.teamIds) : undefined } });
  await audit(req, "tag_updated", "tag", t.id, { old: shape(t), new: d });
  res.json(shape(updated));
});

// Only unused tags can be deleted; tags already on entries are deactivated instead so history keeps its labels.
tagsRouter.delete("/:id", admin, async (req, res) => {
  const t = await prisma.tag.findFirst({ where: { id: Number(req.params.id), companyId: cid(req) }, include: { _count: { select: { entries: true } } } });
  if (!t) throw new HttpError(404, "Tag not found");
  if (t._count.entries) throw new HttpError(409, `"${t.name}" is on ${t._count.entries} entries. Deactivate it instead.`);
  await prisma.tag.delete({ where: { id: t.id } });
  await audit(req, "tag_deleted", "tag", t.id, { old: shape(t) });
  res.json({ ok: true });
});
