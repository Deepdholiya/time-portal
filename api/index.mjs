// Vercel serverless entry for the Express API. With a Postgres DATABASE_URL every
// instance shares that database. Otherwise each instance copies the SQLite demo
// database seeded at build time into /tmp (the only writable path), so sessions
// and changes are not shared between instances.
import fs from "node:fs";
import path from "node:path";

// The Neon integration also provides a pooled URL tuned for Prisma; prefer it at runtime.
if (process.env.POSTGRES_PRISMA_URL) process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "")) {
  const db = "/tmp/time-portal-demo.db";
  if (!fs.existsSync(db)) fs.copyFileSync(path.join(import.meta.dirname, "../server/prisma/demo.db"), db);
  process.env.DATABASE_URL = `file:${db}`;
}
process.env.UPLOAD_DIR ||= "/tmp/uploads";

const { default: app } = await import("../server/dist/app.mjs");
export default app;
