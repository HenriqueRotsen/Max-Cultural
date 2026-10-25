import { notFound } from "next/navigation";
import { PageHeader, StatCard } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { latestSheetVersion } from "@/lib/planning/federal/sheet-versions";
import { compareSheets } from "@/lib/planning/sheet-compare";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  IGUAL: "Igual",
  ALTERADA: "Alterada",
  NOVA: "Nova na readequada",
  REMOVIDA: "Só na anterior",
} as const;

export default async function PlanilhasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId, closedAt: null },
    include: { sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!project) notFound();

  const [homologada, readequada] = await Promise.all([
    latestSheetVersion(project.id, "HOMOLOGADA"),
    latestSheetVersion(project.id, "READEQUADA"),
  ]);
  const current = (project.sheet?.lines || []).map((l) => ({ ...l, amount: l.homologatedAmount }));
  const before = (homologada?.lines || []).map((l) => ({ ...l, amount: l.approvedAmount }));
  const rows = homologada && readequada ? compareSheets(before, current) : [];
  const changed = rows.filter((r) => r.status !== "IGUAL");
  const currentTotal = Number(project.sheet?.totalApproved ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${project.id}`}
        backLabel="Voltar ao projeto"
        breadcrumb={`Planejamento / ${project.externalCode} / Planilhas`}
        title="Planilhas do SALIC"
        description={
          readequada
            ? "O projeto usa a planilha readequada. Abaixo, o que mudou em relação à homologada anterior."
            : "O projeto usa a planilha homologada. Enquanto estiver ativo, o sistema verifica todo dia se o SALIC publicou a readequada e faz a troca sozinho."
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Homologada (anterior)"
          value={homologada ? formatCurrency(homologada.totalApproved) : "—"}
          hint={homologada ? `Copiada em ${homologada.fetchedAt.toLocaleDateString("pt-BR")}` : "Sem cópia"}
        />
        <StatCard
          label="Planilha atual"
          value={formatCurrency(currentTotal)}
          hint={readequada ? `Readequada desde ${readequada.fetchedAt.toLocaleDateString("pt-BR")}` : "Homologada"}
        />
        <StatCard
          label="Rubricas alteradas"
          value={readequada ? String(changed.length) : "—"}
          hint={readequada ? `${rows.length} rubricas comparadas` : "Ainda sem readequada"}
        />
      </section>

      {readequada && homologada ? (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-[0.08em] text-[var(--gray-400)]">
                <th className="px-4 py-3">Rubrica</th>
                <th className="px-4 py-3">Local</th>
                <th className="px-4 py-3 text-right">Homologada</th>
                <th className="px-4 py-3 text-right">Atual</th>
                <th className="px-4 py-3 text-right">Diferença</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.key}
                  className={`border-b border-[var(--border)] ${r.status === "IGUAL" ? "text-[var(--gray-500)]" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-[var(--navy)]">{r.itemName}</p>
                    <p className="text-xs text-[var(--gray-400)]">
                      {r.productName} · {r.stageName}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">{r.local || "—"}</td>
                  <td className="px-4 py-2.5 text-right">{r.before == null ? "—" : formatCurrency(r.before)}</td>
                  <td className="px-4 py-2.5 text-right">{r.after == null ? "—" : formatCurrency(r.after)}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium ${
                      r.diff > 0 ? "text-emerald-700" : r.diff < 0 ? "text-red-700" : ""
                    }`}
                  >
                    {r.diff === 0 ? "—" : `${r.diff > 0 ? "+" : ""}${formatCurrency(r.diff)}`}
                  </td>
                  <td className="px-4 py-2.5">{STATUS_LABEL[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
