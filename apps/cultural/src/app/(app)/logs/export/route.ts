import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildAuditLogOrderBy,
  buildAuditLogWhere,
  parseLogsQuery,
} from "@/lib/logs-query";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.logs", "view")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const query = parseLogsQuery(sp);
  const where = buildAuditLogWhere(query);
  const orderBy = buildAuditLogOrderBy(query);

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy,
    take: 5000,
    include: { actor: { select: { email: true, name: true } } },
  });

  const header = [
    "quando",
    "quem",
    "email",
    "acao",
    "tela",
    "entidade",
    "id",
    "ip",
    "meta",
  ];
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.actor?.name ?? "",
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
