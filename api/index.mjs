// Vercel serverless entry: runs the Express API against a copy of the demo
// database seeded at build time. /tmp is the only writable path, so the data
// resets whenever Vercel starts a fresh instance.
import fs from "node:fs";
import path from "node:path";

const db = "/tmp/time-portal-demo.db";
if (!fs.existsSync(db)) fs.copyFileSync(path.join(import.meta.dirname, "../server/prisma/demo.db"), db);
process.env.DATABASE_URL = `file:${db}`;
process.env.UPLOAD_DIR ||= "/tmp/uploads";

const { default: app } = await import("../server/dist/app.mjs");
export default app;
