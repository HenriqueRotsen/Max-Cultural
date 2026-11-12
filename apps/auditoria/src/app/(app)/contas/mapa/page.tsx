import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { formatCgccpf, normalizeCgccpf } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MapasIndexPage() {
  const { entitlements } = await getWorkspaceContext();
  const accounts = await prisma.salicAccount.findMany({
    where: { workspaceId: entitlements.workspaceId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      cgccpf: true,
      personType: true,
      institutionalMap: true,
    },
  });

  // Empresas observadas também têm mapa societário (CNPJ).
  const watched = (
    await prisma.watchedSupplier.findMany({
      where: { workspaceId: entitlements.workspaceId },
      select: {
        id: true,
        label: true,
        nameQuery: true,
        cgccpf: true,
        supplier: { select: { name: true, cgccpf: true } },
        _count: { select: { corporatePeriods: true } },
      },
    })
  )
    .map((w) => ({
      id: w.id,
      name: w.label || w.supplier?.name || w.nameQuery || "",
      cgccpf: normalizeCgccpf(w.cgccpf || w.supplier?.cgccpf || ""),
      hasMap: w._count.corporatePeriods > 0,
    }))
    .filter((w) => w.cgccpf.length === 14)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Mapa societário"
        title="Mapa societário"
        description="Escolha o proponente ou a empresa observada para ver o mapa de sócios."
      />
      <section className="card overflow-hidden">
        {accounts.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--gray-500)]">
            Nenhum proponente cadastrado.{" "}
            <a
              href={`${(process.env.NEXT_PUBLIC_FINANCEIRO_URL || "").replace(/\/$/, "")}/contas?tab=nova`}
              className="font-semibold text-[var(--navy)] underline"
            >
              Cadastrar proponente no MAX Financeiro
            </a>
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {accounts.map((account) => (
              <li key={account.id}>
                <Link
                  href={`/contas/mapa/${account.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--navy-soft)]"
                >
                  <div>
                    <p className="font-semibold text-[var(--navy)]">{account.name}</p>
                    <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                      {formatCgccpf(account.cgccpf)}
                      <span className="mx-1.5 text-[var(--gray-300)]">·</span>
                      {account.institutionalMap ? "Mapa organizacional" : "Mapa societário"}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-[var(--navy)]">Abrir</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {watched.length > 0 ? (
        <section className="card overflow-hidden">
          <h2 className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-3 text-base font-semibold text-[var(--navy)]">
            Empresas observadas
          </h2>
          <ul className="divide-y divide-[var(--border)]">
            {watched.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/observados/${w.id}/mapa`}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--navy-soft)]"
                >
                  <div>
                    <p className="font-semibold text-[var(--navy)]">{w.name}</p>
                    <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                      {formatCgccpf(w.cgccpf)}
                      <span className="mx-1.5 text-[var(--gray-300)]">·</span>
                      {w.hasMap ? "Mapa societário" : "Mapa ainda não cadastrado"}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-[var(--navy)]">Abrir</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
