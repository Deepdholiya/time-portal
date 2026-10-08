import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function audit(userId: number | null, action: string, entity: string, entityId?: number | null, details?: unknown) {
  await prisma.auditLog.create({
    data: { userId, action, entity, entityId: entityId ?? null, details: details === undefined ? null : JSON.stringify(details) },
  });
}
