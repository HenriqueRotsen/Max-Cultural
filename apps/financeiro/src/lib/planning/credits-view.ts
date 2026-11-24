import { prisma } from "@/lib/db";

const cents = (v: number) => Math.round(v * 100) / 100;

/**
 * Créditos do projeto: comprovantes de pagamento sem nota. O que ainda não
 * tem nota é o saldo; cada nota anexada depois é um uso (comprovante próprio,
 * mesmo arquivo, marcado com `creditOf`).
 */
export async function loadProjectCredits(planningProjectId: string, workspaceId: string) {
  const proofs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId,
      workspaceId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      allocations: { some: { commitment: { paidWithoutNf: true } } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      sourceDocument: { select: { filename: true, kind: true, grossAmount: true } },
      allocations: {
        include: {
          budgetLine: { select: { itemName: true } },
          commitment: {
            select: {
              id: true,
              nfPending: true,
              paidAt: true,
              engagement: { select: { service: { select: { supplier: { select: { name: true, cnpj: true } } } } } },
            },
          },
        },
      },
    },
  });

  const origins = proofs.filter((p) => !(p.extractedJson as { creditOf?: string } | null)?.creditOf);
  const usesOf = (id: string) =>
    proofs.filter((p) => (p.extractedJson as { creditOf?: string } | null)?.creditOf === id);

  return origins
    .map((p) => {
      const pending = p.allocations.filter((a) => a.commitment.nfPending);
      const remaining = cents(pending.reduce((s, a) => s + Number(a.amount), 0));
      const uses = usesOf(p.id).map((u) => ({
        proofId: u.id,
        commitmentId: u.commitmentId,
        amount: Number(u.grossAmount ?? 0),
        nfLabel: u.sourceDocument ? `${u.sourceDocument.kind} ${u.sourceDocument.filename}` : "Nota",
      }));
      // Nota que fechou o crédito: fica no próprio comprovante original.
      if (remaining === 0 && p.sourceDocument) {
        uses.push({
          proofId: p.id,
          commitmentId: p.commitmentId,
          amount: cents(p.allocations.reduce((s, a) => s + Number(a.amount), 0)),
          nfLabel: `${p.sourceDocument.kind} ${p.sourceDocument.filename}`,
        });
      }
      const supplier = p.allocations[0]?.commitment.engagement.service.supplier;
      const total = cents(remaining + uses.reduce((s, u) => s + u.amount, 0));
      return {
        proofId: p.id,
        filename: p.filename,
        supplierName: supplier?.name ?? "—",
        supplierDoc: supplier?.cnpj ?? "",
        paidAt: p.allocations[0]?.commitment.paidAt ?? null,
        total,
        remaining,
        rubricas: pending.map((a) => ({ name: a.budgetLine.itemName, amount: Number(a.amount) })),
        attachCommitmentId: pending[0]?.commitment.id ?? null,
        uses,
      };
    })
    .filter((c) => c.total > 0);
}

/** Quanto ainda sobra de crédito no pagamento sem nota deste lançamento. */
export async function creditLeftForCommitment(commitmentId: string, workspaceId: string) {
  const proof = await prisma.planningDocument.findFirst({
    where: {
      workspaceId,
      kind: "PAYMENT_PROOF",
      allocations: { some: { commitmentId } },
    },
    select: {
      allocations: { select: { amount: true, commitment: { select: { nfPending: true } } } },
    },
  });
  if (!proof) return null;
  return cents(
    proof.allocations.filter((a) => a.commitment.nfPending).reduce((s, a) => s + Number(a.amount), 0),
  );
}
