import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { postHubAudit } from "@/lib/hub-audit";
import type { Prisma } from "@/generated/prisma/client";

async function writeLocalAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  screen?: string;
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
        screen: input.screen ?? "",
        entityType: input.entityType ?? "",
        entityId: input.entityId ?? "",
        meta: input.meta ?? undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit:local]", err);
  }
}

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  screen?: string;
  entityType?: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  const ok = await postHubAudit({
    action: input.action,
    screen: input.screen,
    entityType: input.entityType,
    entityId: input.entityId,
    meta: input.meta,
    ip: input.ip,
  });
  // Fallback local se o hub estiver indisponível (sem sessão SSO / rede).
  if (!ok) {
    await writeLocalAuditLog(input);
  }
}

export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Log de mutação de planejamento (não falha a action). Destino: hub Cultural. */
export async function logPlanningAction(input: {
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue;
  screen?: string;
}) {
  await writeAuditLog({
    ...input,
    screen: input.screen ?? "origem.planejamento",
    ip: await clientIp(),
  });
}
