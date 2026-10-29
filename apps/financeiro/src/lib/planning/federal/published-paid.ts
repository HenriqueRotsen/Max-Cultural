import { prisma } from "@/lib/db";
import { n } from "@/lib/planning/rubric-balance";

/** Soma alocações locais já publicadas ao SALIC (proof com salicComprovanteId). */
export async function loadPublishedPaidByLine(
  planningProjectId: string,
): Promise<Record<string, number>> {
  const map = await loadPublishedPaidByLineBatch([planningProjectId]);
  return map.get(planningProjectId) ?? {};
}

/**
 * Mesmo critério de `loadPublishedPaidByLine`, em lote (evita N+1 no hub / listas).
 */
export async function loadPublishedPaidByLineBatch(
  planningProjectIds: string[],
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  const ids = [...new Set(planningProjectIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const proofs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId: { in: ids },
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: { not: null },
    },
    select: {
      planningProjectId: true,
      allocations: {
        select: {
          budgetLineId: true,
          amount: true,
          commitment: { select: { amount: true, status: true } },
        },
      },
    },
  });

  for (const proof of proofs) {
    const projectId = proof.planningProjectId;
    if (!projectId) continue;
    let byLine = out.get(projectId);
    if (!byLine) {
      byLine = {};
      out.set(projectId, byLine);
    }
    for (const alloc of proof.allocations) {
      if (alloc.commitment.status === "CANCELLED") continue;
      const amt = n(alloc.amount ?? alloc.commitment.amount);
      byLine[alloc.budgetLineId] = (byLine[alloc.budgetLineId] ?? 0) + amt;
    }
  }
  return out;
}
