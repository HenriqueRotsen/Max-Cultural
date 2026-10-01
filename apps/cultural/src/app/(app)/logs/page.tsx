import Link from "next/link";
import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { auditActionLabel, auditScreenLabel } from "@/lib/audit-labels";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Logs" };
export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.logs", "view")) redirect("/");

  const sp = await searchParams;
  const q = (first(sp.q) || "").trim();
  const action = (first(sp.action) || "").trim();
  const actorId = (first(sp.actor) || "").trim();
  const from = (first(sp.from) || "").trim();
  const to = (first(sp.to) || "").trim();

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
    take: 200,
    include: { actor: { select: { email: true, name: true } } },
  });

  const actors = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
    orderBy: { email: "asc" },
    take: 200,
  });

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (action) qs.set("action", action);
  if (actorId) qs.set("actor", actorId);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
            Acesso
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Logs</h1>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            Trilha central: autenticação, IAM do hub e eventos do Origem/Fluxo.
          </p>
        </div>
        <a href={`/logs/export?${qs.toString()}`} className="btn btn-ghost text-sm">
          Exportar CSV
        </a>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-6" method="get">
        <label className="field md:col-span-2">
          <span>Busca</span>
          <input name="q" defaultValue={q} placeholder="ação, e-mail, entidade…" />
        </label>
        <label className="field">
          <span>Ação</span>
          <input name="action" defaultValue={action} placeholder="auth.login" />
        </label>
        <label className="field">
          <span>Usuário</span>
          <select name="actor" defaultValue={actorId}>
            <option value="">Todos</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>De</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className="field">
          <span>Até</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <div className="flex items-end gap-2 md:col-span-6">
          <button type="submit" className="btn">
            Filtrar
          </button>
          <Link href="/logs" className="btn btn-ghost">
            Limpar
          </Link>
        </div>
      </form>

      <section className="card overflow-hidden">
        <table className="data w-full text-sm">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>Ação</th>
              <th>Tela</th>
              <th>Entidade</th>
              <th>IP</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--gray-500)]">
                  Nenhum evento encontrado.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap">
                    {log.createdAt.toLocaleString("pt-BR")}
                  </td>
                  <td>
                    <div className="font-medium text-[var(--navy)]">
                      {log.actor?.name ?? "—"}
                    </div>
                    <div className="text-xs text-[var(--gray-500)]">
                      {log.actor?.email ?? ""}
                    </div>
                  </td>
                  <td>
                    <div className="font-medium text-[var(--navy)]">
                      {auditActionLabel(log.action)}
                    </div>
                    <code className="text-[10px] text-[var(--gray-500)]">{log.action}</code>
                  </td>
                  <td>{auditScreenLabel(log.screen)}</td>
                  <td className="max-w-[10rem] truncate text-xs">
                    {[log.entityType, log.entityId].filter(Boolean).join(" · ") ||
                      "—"}
                  </td>
                  <td>{log.ip || "—"}</td>
                  <td className="max-w-[14rem]">
                    {log.meta ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-[var(--navy)]">
                          meta
                        </summary>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--gray-50)] p-2 text-[10px] leading-snug">
                          {JSON.stringify(log.meta, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
