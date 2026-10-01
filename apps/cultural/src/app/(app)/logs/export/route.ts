import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.logs", "view")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const action = (url.searchParams.get("action") || "").trim();
  const actorId = (url.searchParams.get("actor") || "").trim();
  const from = (url.searchParams.get("from") || "").trim();
  const to = (url.searchParams.get("to") || "").trim();

  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (actorId) where.actorUserId = actorId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999`);
  }
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { screen: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { actor: { email: { contains: q, mode: "insensitive" } } },
      { actor: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { actor: { select: { email: true, name: true } } },
  });

  const header = ["quando", "quem", "acao", "tela", "entidade", "id", "ip", "meta"];
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.actor?.email ?? "",
    log.action,
    log.screen,
    log.entityType,
    log.entityId,
    log.ip ?? "",
    log.meta ? JSON.stringify(log.meta) : "",
  ]);
  const csv = [header, ...rows]
    .map((r) =>
      r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="logs-cultural.csv"',
    },
  });
}
