import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/auth/config";
import { demoProjectWhere } from "@/lib/demo";
import { PageHeader, StatCard } from "@/components/ui";
import { HELP } from "@/lib/help";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const demoProjects = await demoProjectWhere(ws);
  const projectFilter = { salicAccount: { workspaceId: ws }, ...demoProjects };
  const demo = isDemoMode();

  const [accounts, paymentsAgg, watched, lastSync, projects] = await Promise.all([
    prisma.salicAccount.count({ where: { active: true, workspaceId: ws } }),
    prisma.payment.aggregate({
      where: { project: projectFilter },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.watchedSupplier.count({ where: { workspaceId: ws } }),
    prisma.syncRun.findFirst({
      where: {
        OR: [
          { salicAccount: { workspaceId: ws } },
          { salicAccountId: null },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.count({ where: projectFilter }),
  ]);

  const total = Number(paymentsAgg._sum.amount || 0);

  const lastStatus =
    lastSync?.status === "success"
      ? "Concluída"
      : lastSync?.status === "error"
        ? "Com erro"
        : lastSync?.status === "running" || lastSync?.status === "pending"
          ? "Em andamento"
          : lastSync?.status;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Início"
        title="Visão geral"
        description={
          demo
            ? "Demonstração com amostra dos dados — explore insights, PRONACs e fornecedores."
            : "Acompanhe gastos por fornecedor nos projetos culturais das suas empresas."
        }
        actions={
          <>
            {entitlements.syncEnabled && !demo && (
              <Link href="/sync" className="btn">
                Atualizar dados
              </Link>
            )}
            <Link href="/panorama" className="btn btn-ghost">
              Ver insights
            </Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Contas ativas"
          value={String(accounts)}
          hint="Proponentes com atualização ligada"
          help={HELP.active}
        />
        <StatCard
          label="Projetos"
          value={String(projects)}
          hint={demo ? "Amostra (~10%) dos PRONACs" : "PRONACs já carregados"}
        />
        <StatCard
          label="Pagamentos"
          value={String(paymentsAgg._count)}
          hint={demo ? "Linhas na amostra demo" : "Linhas da relação de pagamento"}
        />
        <StatCard
          label="Total carregado"
          value={formatCurrency(total)}
          hint={`${watched} fornecedores observados`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--navy)]">Atalhos</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                href: "/observados",
                title: "Observados",
                text: "Escolha quem você quer acompanhar de perto na análise.",
              },
              {
                href: "/panorama",
                title: "Insights",
                text: "Concentração, maiores fornecedores e projetos em destaque.",
              },
              ...(!demo
                ? [
                    {
                      href: "/sync",
                      title: "Atualizar",
                      text: "Busca projetos e pagamentos no SALIC para o MAX Origem.",
                    },
                    {
                      href: "/auditoria",
                      title: "Relatório",
                      text: "Gere PDF de auditoria com PRONACs e mapa do proponente.",
                    },
                  ]
                : [
                    {
                      href: "/panorama/pronac",
                      title: "Por PRONAC",
                      text: "Veja o detalhe de cada projeto na amostra da demonstração.",
                    },
                  ]),
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-[var(--border)] p-4 transition hover:border-[#c5d0e4] hover:bg-[var(--gray-50)]"
              >
                <p className="font-semibold text-[var(--navy)]">{item.title}</p>
                <p className="mt-1 text-sm text-[var(--gray-500)]">{item.text}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold text-[var(--navy)]">Última atualização</h2>
          {lastSync ? (
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--gray-500)]">Status</span>
                <span
                  className={`badge ${
                    lastSync.status === "success"
                      ? "badge-success"
                      : lastSync.status === "error"
                        ? "badge-warn"
                        : "badge-muted"
                  }`}
                >
                  {lastStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--gray-500)]">Projetos</span>
                <span className="font-medium text-[var(--navy)]">{lastSync.projectsSynced}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--gray-500)]">Pagamentos</span>
                <span className="font-medium text-[var(--navy)]">{lastSync.paymentsUpserted}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--gray-500)]">Nenhuma atualização ainda.</p>
          )}
        </div>
      </section>
    </div>
  );
}
