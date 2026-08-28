import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { PlanningOnboardForm } from "@/components/planning/PlanningOnboardForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { listPlanningRulesets } from "@/lib/planning/rulesets";

export const dynamic = "force-dynamic";

export default async function NovoPlanejamentoPage() {
  const { entitlements } = await getWorkspaceContext();
  const [accounts, rulesets] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { workspaceId: entitlements.workspaceId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cgccpf: true },
    }),
    listPlanningRulesets(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> / Novo
          </>
        }
        title="Iniciar projeto"
        description="Federal ou estadual → proponente → código. A planilha homologada é importada só nesta etapa."
      />
      {!accounts.length ? (
        <div className="card p-5 text-sm text-[var(--gray-500)]">
          Cadastre um proponente em{" "}
          <Link href="/contas" className="font-semibold text-[var(--navy)] underline">
            Proponentes
          </Link>{" "}
          antes de iniciar um projeto.
        </div>
      ) : (
        <PlanningOnboardForm
          accounts={accounts}
          rulesets={rulesets.map((r) => ({
            version: r.version,
            sourceCode: r.sourceCode,
            jurisdiction: r.jurisdiction,
          }))}
        />
      )}
    </div>
  );
}
