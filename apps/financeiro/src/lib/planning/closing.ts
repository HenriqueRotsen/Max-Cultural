import { prisma } from "@/lib/db";
import { isFederalPlanning } from "@/lib/planning/lifecycle";

/**
 * O que impede encerrar: dinheiro reservado sem pagamento, pagamento sem NF,
 * NF/RPA parada na revisão e, no federal, comprovante que não foi ao SALIC.
 */
export async function closingBlockers(
  planningProjectId: string,
  workspaceId: string,
  jurisdiction: string | null,
): Promise<string[]> {
  const [reserved, nfPending, inReview, notInSalic] = await Promise.all([
    prisma.rubricCommitment.count({
      where: { planningProjectId, workspaceId, status: "RESERVED" },
    }),
    prisma.rubricCommitment.count({
      where: { planningProjectId, workspaceId, status: "PAID", nfPending: true },
    }),
    prisma.planningDocument.count({
      where: { planningProjectId, workspaceId, kind: { in: ["NF", "RPA"] }, status: "REVIEW" },
    }),
    isFederalPlanning(jurisdiction)
      ? prisma.planningDocument.count({
          where: {
            planningProjectId,
            workspaceId,
            kind: "PAYMENT_PROOF",
            status: "IMPORTED",
            salicComprovanteId: null,
            salicPublishedAt: null,
          },
        })
      : Promise.resolve(0),
  ]);
  const out: string[] = [];
  if (reserved) out.push(`${reserved} reserva(s) sem pagamento`);
  if (nfPending) out.push(`${nfPending} pagamento(s) sem NF/RPA`);
  if (inReview) out.push(`${inReview} NF/RPA parada(s) na revisão`);
  if (notInSalic) out.push(`${notInSalic} comprovante(s) ainda não enviado(s) ao SALIC`);
  return out;
}
