import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ProducerSheetImportForm } from "@/components/planning/ProducerSheetImportForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";
import type { RubricSelectOption } from "@/components/planning/RubricSearchSelect";

export const dynamic = "force-dynamic";

export default async function ImportarProdutorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      project: { select: { valorCaptado: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
    },
  });
  if (!project?.sheet) notFound();

  const valorCaptado =
    project.project?.valorCaptado != null
      ? Number(project.project.valorCaptado)
      : 0;
  const bal = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
  });

  const rubricOptions: RubricSelectOption[] = project.sheet.lines.map((l) => {
    const lineBal = bal.lines.get(l.id);
    return {
      id: l.id,
      label: `${l.stageName} · ${l.itemName}`,
      available: lineBal?.available ?? 0,
      isAdmin: isAdminProduct(l.productName),
      stageName: l.stageName,
      itemName: l.itemName,
      productName: l.productName,
      city: l.city,
      state: l.state,
      categoryHint: l.categoryHint,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> /{" "}
            Importar produtor
          </>
        }
        title="Importar planilha do produtor"
        description="Sugere rubricas e cria reservas em lote após revisão."
      />
      <ProducerSheetImportForm
        planningProjectId={id}
        rubricOptions={rubricOptions}
      />
    </div>
  );
}
