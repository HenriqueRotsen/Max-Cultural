import { prisma } from "@/lib/db";
import { creditRemaining, fiscalRemaining } from "@/lib/planning/credits";

/**
 * NF/RPA da reserva e quanto dela já foi pago com créditos. Null quando a
 * reserva não tem nota (ou é parcela de pedido, que paga parcela a parcela).
 */
export async function loadFiscalCreditStatus(commitmentId: string, workspaceId: string) {
  const alloc = await prisma.documentRubricAllocation.findFirst({
    where: {
      commitmentId,
      document: { workspaceId, kind: { in: ["NF", "RPA"] }, status: "IMPORTED" },
    },
    select: {
      document: {
        select: {
          id: true,
          kind: true,
          filename: true,
          grossAmount: true,
          allocations: {
            select: { budgetLineId: true, commitmentId: true, sharePct: true, amount: true },
            orderBy: { amount: "desc" },
          },
        },
      },
    },
  });
  if (!alloc) return null;
  const nf = alloc.document;
  const allocations = nf.allocations.map((a) => ({
    budgetLineId: a.budgetLineId,
    commitmentId: a.commitmentId,
    sharePct: a.sharePct,
    amount: Number(a.amount),
  }));
  const expected =
    allocations.reduce((s, a) => s + a.amount, 0) || Number(nf.grossAmount ?? 0);
  const paid = await prisma.paymentCreditUse.aggregate({
    where: { proof: { sourceDocumentId: nf.id } },
    _sum: { amount: true },
  });
  const paidWithCredits = Number(paid._sum.amount || 0);
  return {
    nf: { id: nf.id, kind: nf.kind, filename: nf.filename, allocations },
    expected,
    paidWithCredits,
    remaining: fiscalRemaining(expected, paidWithCredits),
  };
}

/** Quanto da NF/RPA já foi pago com créditos (para o comprovante comum pagar só o resto). */
export async function creditPaidForFiscal(fiscalDocumentId: string): Promise<number> {
  const paid = await prisma.paymentCreditUse.aggregate({
    where: { proof: { sourceDocumentId: fiscalDocumentId } },
    _sum: { amount: true },
  });
  return Number(paid._sum.amount || 0);
}

/** Créditos do projeto com saldo e usos, do mais novo para o mais antigo. */
export async function loadProjectCredits(planningProjectId: string, workspaceId: string) {
  const credits = await prisma.paymentCredit.findMany({
    where: { planningProjectId, workspaceId },
    orderBy: { paidAt: "desc" },
    include: {
      supplier: { select: { name: true, cnpj: true } },
      uses: {
        orderBy: { createdAt: "asc" },
        include: {
          proof: {
            select: {
              id: true,
              commitmentId: true,
              salicComprovanteId: true,
              sourceDocument: { select: { filename: true, kind: true } },
            },
          },
        },
      },
    },
  });
  return credits.map((c) => {
    const uses = c.uses.map((u) => ({
      id: u.id,
      amount: Number(u.amount),
      createdAt: u.createdAt,
      commitmentId: u.proof.commitmentId,
      nfLabel: u.proof.sourceDocument
        ? `${u.proof.sourceDocument.kind} ${u.proof.sourceDocument.filename}`
        : "Nota",
      inSalic: Boolean(u.proof.salicComprovanteId),
    }));
    return {
      id: c.id,
      supplierName: c.supplier.name,
      supplierDoc: c.supplier.cnpj,
      amount: Number(c.amount),
      paidAt: c.paidAt,
      filename: c.filename,
      storagePath: c.storagePath,
      notes: c.notes,
      uses,
      remaining: creditRemaining(Number(c.amount), uses),
    };
  });
}

/** Créditos com saldo do mesmo fornecedor (CPF/CNPJ), para pagar uma nota. */
export async function loadUsableCredits(params: {
  planningProjectId: string;
  workspaceId: string;
  supplierDoc: string;
}) {
  const all = await loadProjectCredits(params.planningProjectId, params.workspaceId);
  return all.filter((c) => c.supplierDoc === params.supplierDoc && c.remaining > 0.005);
}
