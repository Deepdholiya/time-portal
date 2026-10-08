import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { ZodError } from "zod";
import multer from "multer";
import { HttpError, requireAuth } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { optionsRouter } from "./routes/options.js";
import { timeRouter } from "./routes/time.js";
import { timesheetsRouter } from "./routes/timesheets.js";
import { tasksRouter } from "./routes/tasks.js";
import { projectsRouter } from "./routes/projects.js";
import { clientsRouter } from "./routes/clients.js";
import { peopleRouter } from "./routes/people.js";
import { companiesRouter } from "./routes/companies.js";
import { analyticsRouter } from "./routes/analytics.js";
import { reportsRouter } from "./routes/reports.js";
import { roadmapRouter, calendarRouter, leaveRouter } from "./routes/planning.js";
import { settingsRouter } from "./routes/settings.js";
import { notificationsRouter, aiRouter, publicRouter } from "./routes/misc.js";
import { startJobs } from "./jobs.js";

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

app.use("/api/auth", authRouter);
app.use("/api/public", publicRouter);
app.use("/api", requireAuth);
app.use("/api/options", optionsRouter);
app.use("/api/time", timeRouter);
app.use("/api/timesheets", timesheetsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/people", peopleRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/roadmap", roadmapRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/leave", leaveRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/ai", aiRouter);
app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

// Serve the built frontend in production.
const dist = path.resolve(import.meta.dirname, "../../client/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => i.message).join(", ") });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Files must be 10 MB or smaller" : err.message });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
if (process.env.NODE_ENV !== "test") startJobs();
