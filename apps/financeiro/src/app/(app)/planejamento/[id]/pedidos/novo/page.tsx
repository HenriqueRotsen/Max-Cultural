import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { PedidoForm } from "@/components/planning/PedidoForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isFederalPlanning } from "@/lib/planning/lifecycle";
import {
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";
import { rubricSelectLabel } from "@/lib/planning/rubric-label";
import type { RubricSelectOption } from "@/components/planning/RubricSearchSelect";

export const dynamic = "force-dynamic";

export default async function NovoPedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contrato?: string }>;
}) {
  const { id } = await params;
  const contract = (await searchParams).contrato === "1";
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
    },
  });
  if (!project?.sheet) notFound();

  const valorCaptado =
    project.valorCaptado != null
      ? Number(project.valorCaptado)
      : 0;
  const { loadLockedLineIds } = await import("@/lib/planning/hierarchy-lock-db");
  const { lockedLineIds } = await loadLockedLineIds(
    project.sheet.id,
    project.sheet.lines,
  );
  const bal = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    rubricOverrunPct: project.rubricOverrunPct,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
    lockedLineIds,
  });

  const rubricOptions: RubricSelectOption[] = project.sheet.lines.map((l) => {
    const lineBal = bal.lines.get(l.id);
    return {
      id: l.id,
      label: rubricSelectLabel(l),
      sortOrder: l.sortOrder,
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
        backHref={contract ? `/planejamento/${id}/reservas/nova` : `/planejamento/${id}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> /{" "}
            Novo pedido
          </>
        }
        title={contract ? "Reserva por contrato" : "Novo pedido / parcelamento"}
        description={
          contract
            ? `Locação ou serviço em parcelas. O contrato é obrigatório e vai junto em cada parcela, no Docs${isFederalPlanning(project.jurisdiction) ? " e no PDF do SALIC" : ""}.`
            : "Reserve o teto operacional sem NF, em 1× ou N× (ex.: 12 parcelas). Cada parcela aparece no contas a pagar."
        }
      />
      <PedidoForm
        contract={contract}
        planningProjectId={id}
        lines={rubricOptions.filter((l) => l.available > 0 || l.isAdmin)}
      />
    </div>
  );
}
