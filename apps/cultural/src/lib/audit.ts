import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  screen?: string;
  entityType?: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      screen: input.screen ?? "",
      entityType: input.entityType ?? "",
      entityId: input.entityId ?? "",
      meta: input.meta ?? undefined,
      ip: input.ip ?? null,
    },
  });
}
