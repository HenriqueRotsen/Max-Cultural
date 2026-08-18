import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType ?? "",
        entityId: input.entityId ?? "",
        meta: input.meta ?? undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit]", err);
  }
}
