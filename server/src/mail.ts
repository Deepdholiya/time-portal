import nodemailer from "nodemailer";
import { prisma } from "./db.js";

// Every email is stored in the outbox so admins can see exactly what went out.
// Set SMTP_URL (e.g. smtps://user:pass@smtp.example.com) to also deliver it.
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
export const mailConfigured = () => !!transport;
export const appUrl = () => (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

// `logBody` is what the outbox keeps when the delivered body holds a secret such as a temporary password.
export async function sendMail(m: { companyId?: number | null; kind: string; to: string; subject: string; body: string; logBody?: string; aiGenerated?: boolean; sentById?: number | null }) {
  const row = await prisma.emailMessage.create({
    data: { companyId: m.companyId ?? null, kind: m.kind, to: m.to, subject: m.subject, body: m.logBody ?? m.body, aiGenerated: !!m.aiGenerated, sentById: m.sentById ?? null, status: "SENT", sentAt: new Date() },
  });
  if (transport) {
    try {
      await transport.sendMail({ from: process.env.SMTP_FROM || "Time Portal <no-reply@example.com>", to: m.to, subject: m.subject, text: m.body });
    } catch (e) {
      console.error("SMTP delivery failed", e);
    }
  }
  return row;
}
