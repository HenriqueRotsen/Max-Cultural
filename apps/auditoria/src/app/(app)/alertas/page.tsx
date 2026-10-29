import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, StatCard } from "@/components/ui";
import {
  ALERT_STATUS_BADGE,
  ALERT_STATUS_LABEL,
  ALERT_TYPE_LABEL,
  formatDateTime,
} from "@/lib/alerts/labels";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS = [
  { key: "abertos", label: "Em aberto" },
  { key: "NOVO", label: "Novos" },
  { key: "VISTO", label: "Vistos" },
  { key: "RESOLVIDO", label: "Resolvidos" },
  { key: "todos", label: "Todos" },
] as const;

export default async function AlertasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filter = typeof sp.status === "string" ? sp.status : "abertos";
  const accountId = typeof sp.conta === "string" ? sp.conta : "";
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;

  const statusWhere: Prisma.AuditAlertWhereInput =
    filter === "abertos"
      ? { status: { in: ["NOVO", "VISTO"] } }
      : filter === "NOVO" || filter === "VISTO" || filter === "RESOLVIDO"
        ? { status: filter }
        : {};

  const [alerts, counts, accounts] = await Promise.all([
    prisma.auditAlert.findMany({
      where: { workspaceId: ws, ...statusWhere, ...(accountId ? { salicAccountId: accountId } : {}) },
      orderBy: [{ detectedAt: "desc" }],
      take: 200,
      include: { salicAccount: { select: { name: true } }, project: { select: { name: true } } },
    }),
    prisma.auditAlert.groupBy({
      by: ["status"],
      where: { workspaceId: ws },
      _count: { _all: true },
    }),
    prisma.salicAccount.findMany({
      where: { workspaceId: ws },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ status: filter, ...(accountId ? { conta: accountId } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/alertas?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Alertas"
        title="Alertas"
        description="Problemas que a Auditoria encontrou no espelho do SALIC — hoje, projetos que entram em diligência. Cada alerta também vai para o sino do MAX Financeiro e, para quem ativou, por e-mail."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Novos" value={String(count("NOVO"))} hint="Ainda não vistos por ninguém" />
        <StatCard label="Vistos" value={String(count("VISTO"))} hint="Em acompanhamento" />
        <StatCard label="Resolvidos" value={String(count("RESOLVIDO"))} hint="Com registro de quem resolveu" />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={qs({ status: f.key })}
            className={filter === f.key ? "btn" : "btn btn-ghost"}
            aria-current={filter === f.key ? "page" : undefined}
          >
            {f.label}
          </Link>
        ))}
        {accounts.length > 1 ? (
          <form action="/alertas" className="ml-auto flex items-center gap-2">
            <input type="hidden" name="status" value={filter} />
            <select name="conta" defaultValue={accountId} className="field">
              <option value="">Todos os proponentes</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-ghost">
              Filtrar
            </button>
          </form>
        ) : null}
      </div>

      <section className="card overflow-hidden">
        {alerts.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--gray-500)]">
            Nenhum alerta {filter === "abertos" ? "em aberto" : "neste filtro"}.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/alertas/${a.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--gray-50)]"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--navy)]">{a.title}</p>
                    <p className="mt-1 truncate text-sm text-[var(--gray-500)]">
                      {a.salicAccount.name} · {a.project?.name || `PRONAC ${a.pronac}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <span className="text-[var(--gray-500)]">{ALERT_TYPE_LABEL[a.type] || a.type}</span>
                    <span className="text-[var(--gray-400)]">{formatDateTime(a.detectedAt)}</span>
                    <span className={`badge ${ALERT_STATUS_BADGE[a.status]}`}>{ALERT_STATUS_LABEL[a.status]}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
