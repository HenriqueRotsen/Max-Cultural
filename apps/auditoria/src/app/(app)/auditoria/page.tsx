import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { AuditoriaReportForm } from "@/components/AuditoriaReportForm";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const { entitlements } = await getWorkspaceContext();
  const workspaceId = entitlements.workspaceId;

  const projects = await prisma.project.findMany({
    where: {
      salicAccount: { workspaceId },
      payments: { some: {} },
    },
    select: {
      id: true,
      pronac: true,
      name: true,
      salicAccountId: true,
      salicAccount: { select: { name: true } },
    },
    orderBy: [{ salicAccount: { name: "asc" } }, { pronac: "asc" }],
  });

  const options = projects.map((p) => ({
    id: p.id,
    pronac: p.pronac,
    name: p.name || p.pronac,
    accountId: p.salicAccountId,
    accountName: p.salicAccount.name,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Início › Relatório de Auditoria"
        title="Relatório de Auditoria"
        description="Escolha os PRONACs e gere um PDF completo com situação, mapa do proponente, observados, agregados e pagamentos."
      />
      <section className="card p-5">
        <AuditoriaReportForm projects={options} />
      </section>
    </div>
  );
}
