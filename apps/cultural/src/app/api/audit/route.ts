import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

type AuditBody = {
  action?: unknown;
  screen?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  meta?: unknown;
  ip?: unknown;
  occurredAt?: unknown;
};

function asString(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * Ingestão de auditoria dos satélites (Origem / Fluxo).
 * Auth: cookie max_session ou Bearer / x-max-session (mesmo padrão de /api/session/permissions).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: AuditBody;
  try {
    body = (await request.json()) as AuditBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = asString(body.action, 120);
  if (!action) {
    return NextResponse.json({ error: "action_required" }, { status: 400 });
  }

  let occurredAt: Date | undefined;
  if (typeof body.occurredAt === "string" && body.occurredAt.trim()) {
    const d = new Date(body.occurredAt);
    if (!Number.isNaN(d.getTime())) occurredAt = d;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ipFromHeader = forwarded?.split(",")[0]?.trim() || null;

  await writeAuditLog({
    actorUserId: user.id,
    action,
    screen: asString(body.screen, 120),
    entityType: asString(body.entityType, 80),
    entityId: asString(body.entityId, 120),
    meta:
      body.meta !== undefined && body.meta !== null
        ? (body.meta as Prisma.InputJsonValue)
        : undefined,
    ip: asString(body.ip, 80) || ipFromHeader,
    createdAt: occurredAt,
  });

  return NextResponse.json({ ok: true });
}
