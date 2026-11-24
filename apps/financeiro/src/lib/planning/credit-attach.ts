import { prisma } from "@/lib/db";
import { logPlanningAction } from "@/lib/activity-audit";
import { recheckCapsOnAttach } from "@/lib/planning/project-caps-db";
import { scaleTaxes, taxTotalOf } from "@/lib/nf/extract";
import type { ActionState } from "@/lib/planning/action-state";
import { CREDIT_TOLERANCE, splitNfOverCredit, type CreditSlice } from "@/lib/planning/credits";

const cents = (v: number) => Math.round(v * 100) / 100;

/**
 * Nota menor que o crédito do pagamento sem nota: separa a parte da nota.
 * Cada rubrica usada ganha um lançamento próprio (pago, com a NF), e um
 * comprovante próprio com o mesmo arquivo, que vira um lançamento no SALIC.
 * O comprovante original fica com o que sobra (e é reenviado ao SALIC com o
 * novo valor, se já estava lá).
 */
export async function attachNfToCreditPartially(params: {
  userId: string;
  workspaceId: string;
  planningProjectId: string;
  documentId: string;
  docExtractedJson: unknown;
  proofId: string;
  slices: CreditSlice[];
  formAllocations: Array<{ budgetLineId: string; sharePct: number }>;
  hasBond: boolean;
  isReimbursement: boolean;
  supplierName: string;
  cnpj: string;
  grossAmount: number;
  taxesFromForm: Record<string, number | null>;
  fiscalNumber: string;
}): Promise<ActionState & { useCommitmentId?: string }> {
  const split = splitNfOverCredit({
    slices: params.slices,
    nfAmount: params.grossAmount,
    formAllocations: params.formAllocations,
  });
  if (!split.ok) return { error: split.error };

  const commitments = await prisma.rubricCommitment.findMany({
    where: { id: { in: split.parts.map((p) => p.commitmentId) }, workspaceId: params.workspaceId },
    include: { engagement: true },
  });
  const byId = new Map(commitments.map((c) => [c.id, c]));

  const capError = await recheckCapsOnAttach({
    planningProjectId: params.planningProjectId,
    existing: commitments.map((c) => ({
      engagementId: c.engagementId,
      hasBond: c.hasBond,
      isReimbursement: c.isReimbursement,
    })),
    hasBond: params.hasBond,
    isReimbursement: params.isReimbursement,
    // Limites contam o líquido: o imposto retido vai por guia.
    amount: params.grossAmount - taxTotalOf(params.taxesFromForm),
    cnpj: params.cnpj,
    supplierName: params.supplierName,
  });
  if (capError) return { error: capError };

  const taxTotal = taxTotalOf(params.taxesFromForm);
  let useCommitmentId = "";
  try {
    await prisma.$transaction(async (tx) => {
      // Trava o comprovante: duas notas ao mesmo tempo não passam do crédito.
      await tx.$executeRaw`SELECT id FROM planning_documents WHERE id = ${params.proofId} FOR UPDATE`;
      const proof = await tx.planningDocument.findUniqueOrThrow({
        where: { id: params.proofId },
        include: { allocations: { include: { commitment: { select: { nfPending: true, status: true } } } } },
      });
      for (const part of split.parts) {
        const live = proof.allocations.find((a) => a.id === part.allocationId);
        if (!live || !live.commitment.nfPending || Number(live.amount) < part.use - 0.005) {
          throw new Error("CREDIT:O crédito mudou enquanto você revisava. Abra a nota de novo.");
        }
      }

      const claimed = await tx.planningDocument.updateMany({
        where: { id: params.documentId, workspaceId: params.workspaceId, status: "REVIEW" },
        data: {
          status: "IMPORTED",
          grossAmount: params.grossAmount,
          taxTotal,
          taxesJson: params.taxesFromForm as object,
          extractedJson: {
            ...((params.docExtractedJson || {}) as object),
            fiscalNumber: params.fiscalNumber,
            nfNumber: params.fiscalNumber,
            invoiceNumber: params.fiscalNumber,
            fiscalNumberSource: "manual",
            cnpj: params.cnpj,
          },
        },
      });
      if (claimed.count !== 1) throw new Error("CREDIT:Este documento já foi vinculado.");

      const useSlices: Array<{ budgetLineId: string; commitmentId: string; engagementId: string; amount: number; sharePct: number }> = [];
      for (const part of split.parts) {
        const orig = byId.get(part.commitmentId)!;
        const sharePct = Math.round((part.use / params.grossAmount) * 100 * 10000) / 10000;
        if (part.use >= part.amount - CREDIT_TOLERANCE) {
          // A rubrica inteira vai para esta nota: o lançamento sai do crédito.
          await tx.documentRubricAllocation.delete({ where: { id: part.allocationId } });
          await tx.rubricCommitment.update({
            where: { id: orig.id },
            data: { nfPending: false, hasBond: params.hasBond, isReimbursement: params.isReimbursement },
          });
          useSlices.push({
            budgetLineId: part.budgetLineId,
            commitmentId: orig.id,
            engagementId: orig.engagementId,
            amount: part.amount,
            sharePct,
          });
          continue;
        }
        const engagement = await tx.catalogEngagement.create({
          data: {
            workspaceId: orig.engagement.workspaceId,
            serviceId: orig.engagement.serviceId,
            price: part.use,
            unitPrice: part.use,
            quantity: 1,
            priceUnit: "closed",
            hiredAt: orig.engagement.hiredAt,
            source: orig.engagement.source,
            planningProjectId: orig.engagement.planningProjectId,
            budgetLineId: orig.engagement.budgetLineId,
            notes: "Parte do pagamento sem nota (crédito) usada por esta NF",
          },
        });
        const created = await tx.rubricCommitment.create({
          data: {
            budgetLineId: orig.budgetLineId,
            planningProjectId: orig.planningProjectId,
            workspaceId: orig.workspaceId,
            engagementId: engagement.id,
            amount: part.use,
            allocationSharePct: sharePct,
            status: "PAID",
            nfPending: false,
            paidWithoutNf: true,
            hasBond: params.hasBond,
            isReimbursement: params.isReimbursement,
            expectedPayAt: orig.expectedPayAt,
            paidAt: orig.paidAt,
            createdById: params.userId,
          },
        });
        const left = cents(part.amount - part.use);
        await tx.rubricCommitment.update({ where: { id: orig.id }, data: { amount: left } });
        await tx.catalogEngagement.update({
          where: { id: orig.engagementId },
          data: { price: left, unitPrice: left },
        });
        await tx.documentRubricAllocation.update({ where: { id: part.allocationId }, data: { amount: left } });
        useSlices.push({
          budgetLineId: part.budgetLineId,
          commitmentId: created.id,
          engagementId: engagement.id,
          amount: part.use,
          sharePct,
        });
      }

      // A NF fica com as partes usadas.
      for (const s of useSlices) {
        await tx.documentRubricAllocation.create({
          data: {
            documentId: params.documentId,
            budgetLineId: s.budgetLineId,
            commitmentId: s.commitmentId,
            sharePct: s.sharePct,
            amount: s.amount,
            taxesJson: scaleTaxes(params.taxesFromForm, s.sharePct) as object,
          },
        });
      }
      useCommitmentId = useSlices[0]!.commitmentId;
      await tx.planningDocument.update({
        where: { id: params.documentId },
        data: { commitmentId: useCommitmentId, engagementId: useSlices[0]!.engagementId },
      });

      // Comprovante deste uso: o mesmo arquivo, no valor da nota.
      const useProof = await tx.planningDocument.create({
        data: {
          kind: "PAYMENT_PROOF",
          status: "IMPORTED",
          filename: proof.filename,
          mimeType: proof.mimeType,
          storagePath: proof.storagePath,
          byteSize: proof.byteSize,
          originalByteSize: proof.originalByteSize,
          contentHash: proof.contentHash,
          extractedJson: {
            ...((proof.extractedJson as object | null) ?? {}),
            amount: params.grossAmount,
            creditOf: proof.id,
          } as object,
          grossAmount: params.grossAmount,
          workspaceId: proof.workspaceId,
          planningProjectId: proof.planningProjectId,
          engagementId: useSlices[0]!.engagementId,
          commitmentId: useCommitmentId,
          sourceDocumentId: params.documentId,
        },
      });
      for (const s of useSlices) {
        await tx.documentRubricAllocation.create({
          data: {
            documentId: useProof.id,
            budgetLineId: s.budgetLineId,
            commitmentId: s.commitmentId,
            sharePct: s.sharePct,
            amount: s.amount,
          },
        });
      }

      // O comprovante original fica com o que sobra do crédito.
      const rest = await tx.documentRubricAllocation.findMany({
        where: { documentId: proof.id },
        include: { commitment: { select: { engagementId: true } } },
      });
      const restTotal = cents(rest.reduce((s, a) => s + Number(a.amount), 0));
      for (const a of rest) {
        await tx.documentRubricAllocation.update({
          where: { id: a.id },
          data: { sharePct: restTotal > 0 ? Math.round((Number(a.amount) / restTotal) * 100 * 10000) / 10000 : 0 },
        });
      }
      const primary = rest.find((a) => a.commitmentId === proof.commitmentId) ?? rest[0];
      await tx.planningDocument.update({
        where: { id: proof.id },
        data: {
          grossAmount: restTotal,
          ...(primary ? { commitmentId: primary.commitmentId, engagementId: primary.commitment.engagementId } : {}),
          // Já estava no SALIC com o valor cheio: reenviar com o que sobrou.
          ...(proof.salicComprovanteId ? { salicRepublishPending: true } : {}),
        },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("CREDIT:")) return { error: msg.slice("CREDIT:".length) };
    throw err;
  }

  await logPlanningAction({
    actorUserId: params.userId,
    action: "planning.credit_used",
    entityType: "PlanningDocument",
    entityId: params.proofId,
    meta: {
      planningProjectId: params.planningProjectId,
      fiscalDocumentId: params.documentId,
      amount: params.grossAmount,
      rubricas: split.parts.map((p) => ({ budgetLineId: p.budgetLineId, amount: p.use })),
    },
  });
  return { ok: true, useCommitmentId };
}
