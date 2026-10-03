import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LogsExplorer } from "@/components/logs/LogsExplorer";
import {
  buildAuditLogOrderBy,
  buildAuditLogWhere,
  parseLogsQuery,
  type LogRowDTO,
} from "@/lib/logs-query";

export const metadata = { title: "Logs" };
export const dynamic = "force-dynamic";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.logs", "view")) redirect("/");

  const sp = await searchParams;
  const query = parseLogsQuery(sp);
  const where = buildAuditLogWhere(query);
  const orderBy = buildAuditLogOrderBy(query);

  const [total, logs, actors, actionRows, screenRows, entityRows] =
    await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: { email: true, name: true } } },
      }),
      prisma.user.findMany({
        select: { id: true, email: true, name: true },
        orderBy: { email: "asc" },
        take: 300,
      }),
      prisma.auditLog.findMany({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
        take: 200,
      }),
      prisma.auditLog.findMany({
        distinct: ["screen"],
        select: { screen: true },
        orderBy: { screen: "asc" },
        take: 100,
        where: { screen: { not: "" } },
      }),
      prisma.auditLog.findMany({
        distinct: ["entityType"],
        select: { entityType: true },
        orderBy: { entityType: "asc" },
        take: 100,
        where: { entityType: { not: "" } },
      }),
    ]);

  // Se a página pedida ficou além do total (ex.: após filtrar), volta à última.
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  if (query.page > pageCount && total > 0) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val) params.set(k, val);
    }
    params.set("page", String(pageCount));
    redirect(`/logs?${params.toString()}`);
  }

  const rows: LogRowDTO[] = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    action: log.action,
    screen: log.screen,
    entityType: log.entityType,
    entityId: log.entityId,
    ip: log.ip,
    meta: log.meta,
    actorName: log.actor?.name ?? null,
    actorEmail: log.actor?.email ?? null,
    actorUserId: log.actorUserId,
  }));

  return (
    <LogsExplorer
      logs={rows}
      total={total}
      query={query}
      filterOptions={{
        actions: actionRows.map((r) => r.action),
        screens: screenRows.map((r) => r.screen).filter(Boolean),
        entityTypes: entityRows.map((r) => r.entityType).filter(Boolean),
        actors,
      }}
    />
  );
}
