import { Router, type Request, type Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma, audit, parseJson } from "../db.js";
import { HttpError, can, cid, uid } from "../auth.js";
import { filtersSchema, loadEntries, analyticsLevel, type RichEntry, type Filters } from "../scope.js";
import { aggregate, entryRow, GROUPS, type GroupBy } from "./analytics.js";
import { weekStartOf } from "../weeks.js";

export const reportsRouter = Router();

const COLUMNS = ["date", "week", "employee", "team", "client", "project", "subProject", "task", "milestone", "description", "hours", "billable", "start", "end"] as const;
const configSchema = z.object({
  groupBy: z.array(z.enum(GROUPS)).max(2).default([]),
  columns: z.array(z.enum(COLUMNS)).default(["date", "employee", "client", "project", "subProject", "task", "description", "hours", "billable"]),
  sort: z.object({ by: z.string().default("date"), dir: z.enum(["asc", "desc"]).default("desc") }).default({ by: "date", dir: "desc" }),
  chart: z.enum(["bar", "line", "donut", "none"]).default("bar"),
  chartBy: z.enum(GROUPS).default("day"),
});
type Config = z.infer<typeof configSchema>;

const csvSafe = (v: unknown) => {
  const s = String(v ?? "");
  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const hours = (m: number) => Math.round((m / 60) * 100) / 100;

async function run(req: Request, f: Filters, cfg: Config, feature: "analytics" | "export") {
  const level = analyticsLevel(req, feature);
  const entries = await loadEntries(req, f, level);
  const fin = can(req, "financials", "view") && level === "all";
  const rows = entries.map((e) => entryRow(req, e));
  const dir = cfg.sort.dir === "asc" ? 1 : -1;
  const sortKey = (cfg.sort.by === "hours" ? "minutes" : cfg.sort.by === "employee" ? "user" : cfg.sort.by) as keyof (typeof rows)[number];
  const val = (r: (typeof rows)[number]) => { const v = r[sortKey]; return v && typeof v === "object" ? (v as { name: string }).name : v; };
  rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * dir; });
  const groups = cfg.groupBy.length
    ? aggregate(req, entries, cfg.groupBy[0], fin).map((g) => ({
        ...g,
        children: cfg.groupBy[1] ? aggregate(req, entries.filter((e) => inGroup(req, e, cfg.groupBy[0], g.id)), cfg.groupBy[1], fin) : undefined,
      }))
    : [];
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const billable = entries.reduce((s, e) => s + (e.billable ? e.minutes : 0), 0);
  return { level, entries, rows, groups, chart: cfg.chart === "none" ? [] : aggregate(req, entries, cfg.chartBy, false), totals: { minutes: total, billableMinutes: billable, nonBillableMinutes: total - billable, entries: entries.length } };
}

function inGroup(req: Request, e: RichEntry, by: GroupBy, id: unknown) {
  const g = aggregate(req, [e], by, false)[0];
  return g && g.id === id;
}

reportsRouter.post("/run", async (req, res) => {
  const f = filtersSchema.parse(req.body.filters ?? {});
  const cfg = configSchema.parse(req.body.config ?? {});
  const r = await run(req, f, cfg, "analytics");
  const { offset, limit } = z.object({ offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(1000).default(200) }).parse(req.body);
  res.json({ level: r.level, totals: r.totals, groups: r.groups, chart: r.chart, rows: r.rows.slice(offset, offset + limit), rowCount: r.rows.length });
});

// ---- Exports: Excel, CSV and PDF, always using the current filters and the caller's export scope ----

function projectWeekTotals(req: Request, entries: RichEntry[]) {
  const weeks = [...new Set(entries.map((e) => weekStartOf(e.date, req.company!.weekStartsOn)))].sort();
  const projects = aggregate(req, entries, "project", false);
  const cell = new Map<string, number>();
  for (const e of entries) {
    const top = e.project.parent ?? e.project;
    const k = `${top.id}|${weekStartOf(e.date, req.company!.weekStartsOn)}`;
    cell.set(k, (cell.get(k) ?? 0) + e.minutes);
  }
  return { weeks, projects, cell };
}

// Grouped summary for exports: one row per combination of the chosen dimensions, in the order they were picked.
const SUMMARY_DIMS = ["employee", "team", "client", "project", "subProject", "task", "date", "week"] as const;
type SummaryDim = (typeof SUMMARY_DIMS)[number];
const DIM_LABEL: Record<SummaryDim, string> = { employee: "Employee", team: "Team", client: "Client", project: "Project", subProject: "Sub-project", task: "Task", date: "Date", week: "Week" };
type ExportRow = ReturnType<typeof entryRow>;
const dimValue = (x: ExportRow, d: SummaryDim) => {
  switch (d) {
    case "employee": return x.user.name;
    case "team": return x.team ?? "No team";
    case "client": return x.client ?? "No client";
    case "project": return x.project;
    case "subProject": return x.subProject ?? "No sub-project";
    case "task": return x.task ?? "No task";
    case "date": return x.date;
    case "week": return `Week of ${x.week}`;
  }
};
function summarize(rows: ExportRow[], dims: SummaryDim[]) {
  const map = new Map<string, { values: string[]; minutes: number; billable: number; entries: number }>();
  for (const x of rows) {
    const values = dims.map((d) => dimValue(x, d));
    const k = values.join("\u0000");
    const g = map.get(k) ?? { values, minutes: 0, billable: 0, entries: 0 };
    g.minutes += x.minutes; g.billable += x.billable ? x.minutes : 0; g.entries++;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => {
    for (let i = 0; i < dims.length; i++) { const c = a.values[i].localeCompare(b.values[i]); if (c) return c; }
    return 0;
  });
}

async function exportFile(req: Request, res: Response, format: "xlsx" | "csv" | "pdf") {
  const source = req.method === "GET" ? req.query : req.body;
  const f = filtersSchema.parse((source as { filters?: unknown }).filters ?? source);
  const cfg = configSchema.parse(parseJson((source as { config?: string }).config as string, {}));
  const r = await run(req, f, cfg, "export");
  const opts = z.object({ summary: z.string().optional(), details: z.enum(["0", "1"]).default("1") }).parse(source);
  const dims = [...new Set((opts.summary ?? "").split(",").filter((d): d is SummaryDim => (SUMMARY_DIMS as readonly string[]).includes(d)))];
  const details = opts.details === "1" || !dims.length;
  const summary = dims.length ? summarize(r.rows, dims) : [];
  const summaryTitle = dims.map((d) => DIM_LABEL[d]).join(" › ");
  const company = req.company!;
  const name = `timesheet-${dims.length ? dims.join("-") + "-" : ""}${f.from}-to-${f.to}`;
  await audit(req, "export", "report", null, { new: { format, filters: f, rows: r.rows.length } });
  const { weeks, projects, cell } = projectWeekTotals(req, r.entries);

  if (format === "csv") {
    const lines: string[] = [];
    if (dims.length) {
      lines.push(csvSafe(`Summary by ${summaryTitle}`));
      lines.push([...dims.map((d) => DIM_LABEL[d]), "Hours", "Billable hours", "Entries"].map(csvSafe).join(","));
      for (const g of summary) lines.push([...g.values, hours(g.minutes), hours(g.billable), g.entries].map(csvSafe).join(","));
      lines.push([...dims.map((_, i) => (i === 0 ? "Total" : "")), hours(r.totals.minutes), hours(r.totals.billableMinutes), r.totals.entries].map(csvSafe).join(","));
    }
    if (details) {
    if (lines.length) lines.push("");
    const header = ["Company", "Date", "Week", "Employee", "Team", "Client", "Project", "Sub-project", "Task", "Milestone", "Hours", "Billable", "Description"];
    lines.push(header.join(","));
    for (const x of r.rows) lines.push([company.name, x.date, x.week, x.user.name, x.team, x.client, x.project, x.subProject, x.task, x.milestone, hours(x.minutes), x.billable ? "Yes" : "No", x.description].map(csvSafe).join(","));
    lines.push("", ["Project", ...weeks.map((w) => `Week of ${w}`), "Total"].map(csvSafe).join(","));
    for (const p of projects) lines.push([p.name, ...weeks.map((w) => hours(cell.get(`${p.id}|${w}`) ?? 0)), hours(p.minutes)].map(csvSafe).join(","));
    lines.push(["Grand total", ...weeks.map((w) => hours(projects.reduce((s, p) => s + (cell.get(`${p.id}|${w}`) ?? 0), 0))), hours(r.totals.minutes)].map(csvSafe).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}.csv"`);
    return res.send("﻿" + lines.join("\n"));
  }

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Time Portal";
    if (dims.length) {
      const sw = wb.addWorksheet(`By ${summaryTitle}`.replace(/[*?:\\/[\]]/g, " ").slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
      sw.addRow([...dims.map((d) => DIM_LABEL[d]), "Hours", "Billable hours", "Entries"]).font = { bold: true };
      for (const g of summary) sw.addRow([...g.values, hours(g.minutes), hours(g.billable), g.entries]);
      sw.addRow([...dims.map((_, i) => (i === 0 ? "Total" : "")), hours(r.totals.minutes), hours(r.totals.billableMinutes), r.totals.entries]).font = { bold: true };
      dims.forEach((_, i) => { sw.getColumn(i + 1).width = 24; });
      for (const i of [dims.length + 1, dims.length + 2]) { sw.getColumn(i).width = 14; sw.getColumn(i).numFmt = "0.00"; }
    }
    const ws = wb.addWorksheet("Time entries", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Company", key: "company", width: 18 }, { header: "Date", key: "date", width: 12 }, { header: "Week", key: "week", width: 12 },
      { header: "Employee", key: "employee", width: 20 }, { header: "Team", key: "team", width: 14 }, { header: "Client", key: "client", width: 20 },
      { header: "Project", key: "project", width: 22 }, { header: "Sub-project", key: "subProject", width: 20 }, { header: "Task", key: "task", width: 28 },
      { header: "Hours", key: "hours", width: 9, style: { numFmt: "0.00" } }, { header: "Billable", key: "billable", width: 9 }, { header: "Description", key: "description", width: 50 },
    ];
    for (const x of r.rows) ws.addRow({ company: company.name, date: x.date, week: x.week, employee: x.user.name, team: x.team, client: x.client, project: x.project, subProject: x.subProject, task: x.task, hours: hours(x.minutes), billable: x.billable ? "Yes" : "No", description: x.description });
    const totalRow = ws.addRow({ company: "Grand total", hours: hours(r.totals.minutes) });
    totalRow.font = { bold: true };
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: "A1", to: "L1" };
    if (!details) wb.removeWorksheet(ws.id);

    const pw = wb.addWorksheet("Project weekly totals");
    pw.addRow(["Project", ...weeks.map((w) => `Week of ${w}`), "Total"]).font = { bold: true };
    for (const p of projects) pw.addRow([p.name, ...weeks.map((w) => hours(cell.get(`${p.id}|${w}`) ?? 0)), hours(p.minutes)]);
    pw.addRow(["Grand total", ...weeks.map((w) => hours(projects.reduce((s, p) => s + (cell.get(`${p.id}|${w}`) ?? 0), 0))), hours(r.totals.minutes)]).font = { bold: true };
    pw.getColumn(1).width = 28;
    for (let i = 2; i <= weeks.length + 2; i++) { pw.getColumn(i).width = 14; pw.getColumn(i).numFmt = "0.00"; }

    const sm = wb.addWorksheet("Summary");
    sm.addRows([["Company", company.name], ["Period", `${f.from} to ${f.to}`], ["Generated", new Date().toISOString()], ["Generated by", req.user!.name], ["Scope", r.level === "own" ? "Own time" : "All permitted time"], [], ["Total hours", hours(r.totals.minutes)], ["Billable hours", hours(r.totals.billableMinutes)], ["Non-billable hours", hours(r.totals.nonBillableMinutes)], ["Entries", r.totals.entries]]);
    sm.getColumn(1).width = 20; sm.getColumn(2).width = 40;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${name}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }

  // PDF summary: totals, project-by-week table and the first entries.
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.pdf"`);
  doc.pipe(res);
  doc.fontSize(16).text(`${company.name} · Time report`).moveDown(0.2);
  doc.fontSize(9).fillColor("#666").text(`${f.from} to ${f.to} · generated ${new Date().toLocaleString()} by ${req.user!.name}`).moveDown();
  doc.fillColor("#000").fontSize(11).text(`Total ${hours(r.totals.minutes)} h · billable ${hours(r.totals.billableMinutes)} h · non-billable ${hours(r.totals.nonBillableMinutes)} h · ${r.totals.entries} entries`).moveDown();
  if (dims.length) {
    doc.fontSize(11).text(`Hours by ${summaryTitle}`).moveDown(0.3).fontSize(9);
    for (const g of summary) doc.text(`${g.values.join("  ›  ")}   ${hours(g.minutes).toFixed(2)} h${g.billable !== g.minutes ? ` (${hours(g.billable).toFixed(2)} h billable)` : ""}`);
    doc.moveDown();
  } else {
    doc.fontSize(11).text("Hours by project").moveDown(0.3);
    doc.fontSize(9);
    for (const p of projects) doc.text(`${p.name.padEnd(40, " ")} ${hours(p.minutes).toFixed(2)} h`);
  }
  if (details) doc.moveDown().fontSize(11).text("Entries").moveDown(0.3).fontSize(8);
  for (const x of details ? r.rows.slice(0, 400) : []) {
    doc.text(`${x.date}  ${x.user.name} · ${x.project}${x.subProject ? " › " + x.subProject : ""}${x.task ? " · " + x.task : ""} · ${hours(x.minutes).toFixed(2)} h ${x.billable ? "" : "(non-billable)"}`);
    doc.fillColor("#555").text(`    ${x.description}`).fillColor("#000");
  }
  if (details && r.rows.length > 400) doc.moveDown().text(`…and ${r.rows.length - 400} more entries. Use the Excel export for the full list.`);
  doc.end();
}

reportsRouter.get("/export.xlsx", (req, res) => exportFile(req, res, "xlsx"));
reportsRouter.get("/export.csv", (req, res) => exportFile(req, res, "csv"));
reportsRouter.get("/export.pdf", (req, res) => exportFile(req, res, "pdf"));

// ---- Saved and scheduled reports ----
const savedSchema = z.object({
  name: z.string().trim().min(1, "Name the report").max(100),
  filters: z.record(z.string(), z.unknown()),
  config: configSchema,
  preset: z.string().optional(),
  schedule: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]).nullish(),
});

export function nextRun(schedule: string, from = new Date()) {
  const d = new Date(from);
  d.setHours(7, 0, 0, 0);
  if (schedule === "DAILY") d.setDate(d.getDate() + 1);
  else if (schedule === "WEEKLY") d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  else if (schedule === "MONTHLY") { d.setMonth(d.getMonth() + 1, 1); }
  else { d.setMonth(Math.floor(d.getMonth() / 3) * 3 + 3, 1); }
  return d;
}

reportsRouter.get("/saved", async (req, res) => {
  const rows = await prisma.savedReport.findMany({ where: { companyId: cid(req), userId: uid(req) }, orderBy: { createdAt: "desc" } });
  res.json(rows.map((r) => ({ ...r, config: parseJson(r.config, {}) })));
});

reportsRouter.post("/saved", async (req, res) => {
  const d = savedSchema.parse(req.body);
  const row = await prisma.savedReport.create({ data: { companyId: cid(req), userId: uid(req), name: d.name, config: JSON.stringify({ filters: d.filters, config: d.config, preset: d.preset }), schedule: d.schedule ?? null, nextRunAt: d.schedule ? nextRun(d.schedule) : null } });
  await audit(req, "report_saved", "report", row.id, { new: { name: d.name, schedule: d.schedule } });
  res.status(201).json(row);
});

reportsRouter.put("/saved/:id", async (req, res) => {
  const r = await prisma.savedReport.findFirst({ where: { id: Number(req.params.id), companyId: cid(req), userId: uid(req) } });
  if (!r) throw new HttpError(404, "Report not found");
  const d = savedSchema.parse(req.body);
  res.json(await prisma.savedReport.update({ where: { id: r.id }, data: { name: d.name, config: JSON.stringify({ filters: d.filters, config: d.config, preset: d.preset }), schedule: d.schedule ?? null, nextRunAt: d.schedule ? nextRun(d.schedule) : null } }));
});

reportsRouter.delete("/saved/:id", async (req, res) => {
  await prisma.savedReport.deleteMany({ where: { id: Number(req.params.id), companyId: cid(req), userId: uid(req) } });
  res.json({ ok: true });
});
