import { prisma } from "@/lib/db";

export type FineRow = {
  proofId: string;
  paidAt: Date | null;
  supplierName: string;
  documentNumber: string | null;
  nfAmount: number;
  paidAmount: number;
  fineAmount: number;
  commitmentId: string | null;
};

/**
 * Multas e juros pagos no projeto (comprovante maior que a nota, marcado na
 * revisão do valor). Não podem sair do projeto: o proponente devolve.
 */
export async function loadProjectFines(params: { workspaceId: string; planningProjectId: string }) {
  const docs = await prisma.planningDocument.findMany({
    where: {
      workspaceId: params.workspaceId,
      planningProjectId: params.planningProjectId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      extractedJson: { path: ["paymentReview", "fineAmount"], gt: 0 },
    },
    select: {
      id: true,
      extractedJson: true,
      grossAmount: true,
      commitmentId: true,
      commitment: {
        select: { paidAt: true, engagement: { select: { service: { select: { supplier: { select: { name: true } } } } } } },
      },
      engagement: { select: { service: { select: { supplier: { select: { name: true } } } } } },
      sourceDocument: { select: { extractedJson: true, grossAmount: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const rows: FineRow[] = docs.map((d) => {
    const review = (d.extractedJson as { paymentReview?: { fineAmount?: number; paidAmount?: number } } | null)
      ?.paymentReview;
    const fine = Number(review?.fineAmount ?? 0);
    const paid = Number(review?.paidAmount ?? d.grossAmount ?? 0);
    const nfExt = (d.sourceDocument?.extractedJson || {}) as {
      fiscalNumber?: string | null;
      nfNumber?: string | null;
    };
    return {
      proofId: d.id,
      paidAt: d.commitment?.paidAt ?? null,
      supplierName:
        d.commitment?.engagement.service.supplier.name ?? d.engagement?.service.supplier.name ?? "Fornecedor",
      documentNumber: nfExt.fiscalNumber ?? nfExt.nfNumber ?? null,
      nfAmount: Math.round((paid - fine) * 100) / 100,
      paidAmount: paid,
      fineAmount: fine,
      commitmentId: d.commitmentId,
    };
  });
  return { rows, total: rows.reduce((n, r) => n + r.fineAmount, 0) };
}
