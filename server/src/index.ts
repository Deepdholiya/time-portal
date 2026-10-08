import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { ZodError } from "zod";
import { HttpError, requireAuth } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { optionsRouter } from "./routes/options.js";
import { timeRouter } from "./routes/time.js";
import { analyticsRouter } from "./routes/analytics.js";
import { projectsRouter } from "./routes/projects.js";
import { roadmapRouter } from "./routes/roadmap.js";
import { peopleRouter } from "./routes/people.js";
import { settingsRouter } from "./routes/settings.js";
import { timesheetsRouter } from "./routes/timesheets.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api", requireAuth);
app.use("/api/options", optionsRouter);
app.use("/api/time", timeRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/roadmap", roadmapRouter);
app.use("/api/people", peopleRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/timesheets", timesheetsRouter);

// Serve the built frontend in production.
const dist = path.resolve(import.meta.dirname, "../../client/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => i.message).join(", ") });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
