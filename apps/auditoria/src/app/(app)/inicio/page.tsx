import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, Section, StatCard, StatusBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const projectFilter = { salicAccount: { workspaceId: ws } };

  const [accounts, paymentsAgg, watched, lastSync, projects, openAlerts, projectsWithPayments] = await Promise.all([
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
    prisma.auditAlert.count({ where: { workspaceId: ws, status: { in: ["NOVO", "VISTO"] } } }),
    prisma.project.count({ where: { ...projectFilter, payments: { some: {} } } }),
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

  const steps = [
    {
      href: "/alertas",
      title: "Veja os alertas",
      text:
        openAlerts > 0
          ? `${openAlerts} alerta${openAlerts === 1 ? "" : "s"} em aberto: diligências e outros problemas no SALIC.`
          : "Nenhum alerta em aberto agora.",
    },
    {
      href: "/panorama/pronac",
      title: "Confira os PRONACs",
      text: "Veja quais projetos passaram ou estão perto dos limites da IN.",
    },
    {
      href: "/auditoria",
      title: "Gere o relatório",
      text: "Escolha os PRONACs e baixe um PDF completo para a auditoria.",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Início"
        description="A Auditoria espelha o SALIC dos seus proponentes e avisa quando um projeto passa dos limites ou entra em diligência."
        actions={
          entitlements.syncEnabled ? (
            <Link href="/atualizacao" className="btn btn-ghost">
              Atualizar dados do SALIC
            </Link>
          ) : null
        }
      />

      {openAlerts > 0 ? (
        <Link href="/alertas" className="block hover:opacity-95">
          <StatusBanner
            tone="critical"
            title={`${openAlerts} alerta${openAlerts === 1 ? "" : "s"} em aberto`}
          >
            Projetos em diligência ou com outros problemas encontrados no SALIC.{" "}
            <span className="font-semibold underline underline-offset-2">Ver alertas</span>
          </StatusBanner>
        </Link>
      ) : null}

      <Section
        title="Por onde começar"
        description="O caminho mais comum na Auditoria, em três passos."
      >
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.href}>
              <Link
                href={step.href}
                className="flex h-full gap-3 rounded-xl border border-[var(--border)] p-4 transition hover:border-[var(--gold-border)] hover:bg-[var(--navy-soft)]"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-base font-semibold text-[var(--navy)]">
                    {step.title}
                  </span>
                  <span className="mt-1 block text-[0.95rem] text-[var(--gray-600)]">
                    {step.text}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Seus números"
        description="O que já foi carregado do SALIC para a Auditoria."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Proponentes"
            value={String(accounts)}
            hint="Com atualização ligada"
          />
          <StatCard
            label="Projetos"
            value={String(projects)}
            hint={
              projects > projectsWithPayments
                ? `${projectsWithPayments} com pagamentos · ${projects - projectsWithPayments} ainda sem`
                : "PRONACs carregados"
            }
          />
          <StatCard
            label="Pagamentos"
            value={String(paymentsAgg._count)}
            hint={`${watched} fornecedor${watched === 1 ? "" : "es"} observado${watched === 1 ? "" : "s"}`}
          />
          <StatCard label="Total pago" value={formatCurrency(total)} hint="Soma dos pagamentos" />
        </div>
      </Section>

      <Section
        title="Última atualização do SALIC"
        description={
          lastSync
            ? `${lastStatus} · ${lastSync.projectsSynced} projetos e ${lastSync.paymentsUpserted} pagamentos atualizados.`
            : "Nenhuma atualização ainda."
        }
        actions={
          lastSync ? (
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
          ) : null
        }
      />
    </div>
  );
}
