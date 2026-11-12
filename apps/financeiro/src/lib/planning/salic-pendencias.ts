import { prisma } from "@/lib/db";

/**
 * Pendências do projeto vindas da comparação com o SALIC:
 * - pago no SALIC sem lançamento no sistema (anexar NF e comprovante);
 * - excluído no SALIC mas ainda lançado no sistema (decidir o que fazer).
 */
export async function loadSalicPendencias(planningProjectId: string, workspaceId: string) {
  const [semLancamento, excluidosNoSalic] = await Promise.all([
    prisma.salicPaymentRecord.findMany({
      where: {
        planningProjectId,
        workspaceId,
        removedAt: null,
        linkedProofId: null,
        resolvedAt: null,
      },
      orderBy: [{ paymentDate: "asc" }, { supplierName: "asc" }],
    }),
    prisma.salicPaymentRecord.findMany({
      where: {
        planningProjectId,
        workspaceId,
        removedAt: { not: null },
        linkedProofId: { not: null },
        resolvedAt: null,
      },
      orderBy: { removedAt: "desc" },
    }),
  ]);

  // Só conta como "excluído no SALIC" se o lançamento ainda existe no sistema.
  const proofIds = excluidosNoSalic.map((r) => r.linkedProofId!).filter((id) => id !== "pending");
  const proofs = proofIds.length
    ? await prisma.planningDocument.findMany({
        where: { id: { in: proofIds }, status: "IMPORTED" },
        select: { id: true, commitmentId: true, salicComprovanteId: true },
      })
    : [];
  const proofById = new Map(proofs.map((p) => [p.id, p]));
  const excluidos = excluidosNoSalic
    .filter((r) => proofById.has(r.linkedProofId!))
    .map((r) => ({ ...r, commitmentId: proofById.get(r.linkedProofId!)!.commitmentId }));

  return { semLancamento, excluidos, total: semLancamento.length + excluidos.length };
}

export async function countSalicPendencias(planningProjectId: string, workspaceId: string) {
  return (await loadSalicPendencias(planningProjectId, workspaceId)).total;
}
