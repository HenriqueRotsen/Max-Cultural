import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { postHubAudit } from "@/lib/hub-audit";

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  screen?: string;
  entityType?: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  const screen = input.screen ?? "fluxo.app";
  try {
    const ok = await postHubAudit({
      action: input.action,
      screen,
      entityType: input.entityType,
      entityId: input.entityId,
      meta: input.meta,
      ip: input.ip,
    });
    // Mantém cópia local para a UI legado /dashboard/acesso/auditoria;
    // a fonte da verdade no teste/prod é o hub Cultural /logs.
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
    if (!ok && process.env.NODE_ENV === "development") {
      console.warn("[audit] hub indisponível; gravado só local");
    }
  } catch (err) {
    console.error("[audit]", err);
  }
}
