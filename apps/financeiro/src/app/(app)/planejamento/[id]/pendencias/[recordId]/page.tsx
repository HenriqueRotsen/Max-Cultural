import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { RegisterSalicPaymentForm } from "@/components/planning/RegisterSalicPaymentForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCgccpf, formatCurrency } from "@/lib/format";
import { rubricSelectLabel } from "@/lib/planning/rubric-label";

export const dynamic = "force-dynamic";

export default async function RegistrarPagamentoSalicPage({
  params,
}: {
  params: Promise<{ id: string; recordId: string }>;
}) {
  const { id, recordId } = await params;
  const { entitlements } = await getWorkspaceContext();
  const record = await prisma.salicPaymentRecord.findFirst({
    where: { id: recordId, planningProjectId: id, workspaceId: entitlements.workspaceId, removedAt: null, linkedProofId: null },
    include: {
      planningProject: {
        select: {
          externalCode: true,
          sheet: {
            select: {
              lines: {
                select: { id: true, sortOrder: true, itemName: true, stageName: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (!record) notFound();
  const lines = record.planningProject.sheet?.lines ?? [];
  const line = lines.find((l) => l.id === record.budgetLineId);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${id}/pendencias`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${id}`}>{record.planningProject.externalCode}</Link> /{" "}
            <Link href={`/planejamento/${id}/pendencias`}>Pendências</Link>
          </>
        }
        title="Anexar NF e comprovante"
        description="Pagamento que já está no SALIC. Os documentos precisam ser deste fornecedor e deste valor."
      />
      <div className="card grid gap-2 p-5 text-sm sm:grid-cols-2">
        <p>
          <span className="text-[var(--gray-500)]">Fornecedor:</span> {record.supplierName} ·{" "}
          {formatCgccpf(record.supplierDoc)}
        </p>
        <p>
          <span className="text-[var(--gray-500)]">Valor pago:</span>{" "}
          <strong>{formatCurrency(Number(record.amount))}</strong>
        </p>
        <p>
          <span className="text-[var(--gray-500)]">Pago em:</span> {record.paymentDate ?? "—"}
        </p>
        <p>
          <span className="text-[var(--gray-500)]">Rubrica:</span>{" "}
          {line ? rubricSelectLabel(line) : (record.rubricItem ?? "não identificada")}
        </p>
      </div>
      <RegisterSalicPaymentForm
        recordId={record.id}
        needsRubric={!line}
        lines={lines.map((l) => ({ id: l.id, label: rubricSelectLabel(l) }))}
      />
    </div>
  );
}
