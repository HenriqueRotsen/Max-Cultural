import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BoletoReservationForm } from "@/components/planning/BoletoReservationForm";
import { MissingSheetNotice } from "@/components/planning/MissingSheetNotice";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";
import { rubricSelectLabel } from "@/lib/planning/rubric-label";
import type { RubricSelectOption } from "@/components/planning/RubricSearchSelect";

export const dynamic = "force-dynamic";

export default async function ReservaBoletoPage({
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
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
    },
  });
  if (!project) notFound();
  if (!project.sheet) {
    return (
      <MissingSheetNotice
        projectId={project.id}
        externalCode={project.externalCode}
        title="Reserva por boleto"
      />
    );
  }

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
        backHref={`/planejamento/${id}/reservas/nova`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> / Reserva por boleto
          </>
        }
        title="Reserva por boleto"
        description="O valor e o vencimento vêm do próprio boleto. Boleto vencido, repetido ou de outro fornecedor não entra."
      />
      <BoletoReservationForm planningProjectId={project.id} lines={rubricOptions} />
    </div>
  );
}
