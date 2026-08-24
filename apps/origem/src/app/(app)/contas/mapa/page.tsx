import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { formatCgccpf } from "@/lib/format";

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

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Proponentes › Mapa"
        title="Mapa societário"
        description="Escolha o proponente para ver o mapa de sócios e vínculos."
      />
      <section className="card overflow-hidden">
        {accounts.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--gray-500)]">
            Nenhum proponente cadastrado.{" "}
            <Link href="/contas" className="font-semibold text-[var(--navy)] underline">
              Cadastrar proponente
            </Link>
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
    </div>
  );
}
