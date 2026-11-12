import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";
import type { SalicRelacaoPagamento } from "@/lib/salic/publish-robot";

const cents = (n: number) => Math.round(n * 100);

/**
 * Guarda a relação de pagamentos do SALIC do projeto (um registro por
 * id_comprovante_pagamento) e liga cada pagamento ao comprovante do sistema
 * que é o mesmo pagamento:
 * - já enviado pelo sistema (salicComprovanteId igual), ou
 * - lançado no sistema e nunca ligado: mesmo CPF/CNPJ, mesma rubrica e mesmo
 *   valor. Ligar evita contar o pagamento duas vezes no saldo (SALIC + sistema).
 * O que sumiu do SALIC fica marcado como excluído lá (vira pendência).
 */
export async function recordSalicPayments(
  planningProjectId: string,
  items: SalicRelacaoPagamento[],
): Promise<{ linked: number; removed: number }> {
  const project = await prisma.planningProject.findUnique({
    where: { id: planningProjectId },
    select: {
      workspaceId: true,
      sheet: { select: { lines: { select: { id: true, planilhaAprovacaoId: true } } } },
    },
  });
  if (!project) return { linked: 0, removed: 0 };

  const lineByPlanilha = new Map(
    (project.sheet?.lines ?? [])
      .filter((l) => l.planilhaAprovacaoId)
      .map((l) => [String(l.planilhaAprovacaoId).trim(), l.id]),
  );
  const now = new Date();

  for (const item of items) {
    const data = {
      planilhaAprovacaoId: item.planilhaAprovacaoId,
      budgetLineId: item.planilhaAprovacaoId
        ? (lineByPlanilha.get(item.planilhaAprovacaoId.trim()) ?? null)
        : null,
      supplierName: item.supplierName,
      supplierDoc: normalizeCgccpf(item.supplierDoc),
      amount: item.amount,
      paymentDate: item.paymentDate,
      proofNumber: item.proofNumber,
      rubricItem: item.rubricItem,
      lastSeenAt: now,
      removedAt: null,
    };
    await prisma.salicPaymentRecord.upsert({
      where: { planningProjectId_externalId: { planningProjectId, externalId: item.id } },
      create: {
        workspaceId: project.workspaceId,
        planningProjectId,
        externalId: item.id,
        ...data,
      },
      update: data,
    });
  }

  const seen = items.map((i) => i.id);
  const removed = await prisma.salicPaymentRecord.updateMany({
    where: {
      planningProjectId,
      removedAt: null,
      ...(seen.length ? { externalId: { notIn: seen } } : {}),
    },
    data: { removedAt: now },
  });

  const linked = await linkSalicPaymentsToProofs(planningProjectId);
  return { linked, removed: removed.count };
}

/** Liga pagamentos do SALIC ainda sem comprovante do sistema ao comprovante equivalente. */
export async function linkSalicPaymentsToProofs(planningProjectId: string): Promise<number> {
  const records = await prisma.salicPaymentRecord.findMany({
    where: { planningProjectId, removedAt: null, linkedProofId: null },
  });
  if (records.length === 0) return 0;

  const proofs = await prisma.planningDocument.findMany({
    where: { planningProjectId, kind: "PAYMENT_PROOF", status: "IMPORTED" },
    select: {
      id: true,
      salicComprovanteId: true,
      allocations: {
        select: {
          budgetLineId: true,
          amount: true,
          commitment: {
            select: {
              status: true,
              engagement: { select: { service: { select: { supplier: { select: { cnpj: true } } } } } },
            },
          },
        },
      },
    },
  });
  const alreadyLinked = new Set(
    (
      await prisma.salicPaymentRecord.findMany({
        where: { planningProjectId, linkedProofId: { not: null } },
        select: { linkedProofId: true },
      })
    ).map((r) => r.linkedProofId),
  );

  let linked = 0;
  for (const record of records) {
    // 1) Já enviado pelo sistema.
    let proof = proofs.find((p) => p.salicComprovanteId === record.externalId);
    // 2) Lançado no sistema e nunca ligado: mesmo fornecedor, rubrica e valor.
    if (!proof) {
      proof = proofs.find((p) => {
        if (p.salicComprovanteId || alreadyLinked.has(p.id)) return false;
        const allocs = p.allocations.filter((a) => a.commitment.status !== "CANCELLED");
        if (allocs.length === 0) return false;
        const doc = normalizeCgccpf(allocs[0]!.commitment.engagement.service.supplier.cnpj);
        const total = allocs.reduce((s, a) => s + cents(Number(a.amount)), 0);
        const sameLine =
          !record.budgetLineId || allocs.some((a) => a.budgetLineId === record.budgetLineId);
        return doc === record.supplierDoc && total === cents(Number(record.amount)) && sameLine;
      });
      if (proof) {
        await prisma.planningDocument.update({
          where: { id: proof.id },
          data: { salicComprovanteId: record.externalId, salicPublishedAt: new Date() },
        });
        proof.salicComprovanteId = record.externalId;
      }
    }
    if (!proof) continue;
    alreadyLinked.add(proof.id);
    await prisma.salicPaymentRecord.update({
      where: { id: record.id },
      data: { linkedProofId: proof.id },
    });
    linked += 1;
  }
  return linked;
}
