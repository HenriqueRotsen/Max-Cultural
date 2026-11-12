"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { logPlanningAction } from "@/lib/activity-audit";
import { canDeletePaidPayment } from "@/lib/planning/acl";
import { deleteSalicComprovante } from "@/lib/planning/federal/salic-publish";
import type { ActionState } from "@/lib/planning/action-state";

/** Palavra que a pessoa digita na segunda confirmação. */
const CONFIRM_WORD = "EXCLUIR";

const PLANNING_SOURCES = ["PLANNING_NF", "PLANNING_RPA", "PLANNING_MANUAL", "PLANNING_PEDIDO"] as const;

/**
 * Exclui um lançamento já pago, com o comprovante: tira o pagamento do SALIC
 * (se foi enviado e ainda está lá) e depois apaga no sistema o lançamento, a
 * NF/RPA, o comprovante e as guias. Rateio em várias rubricas sai inteiro.
 * Exige a permissão "Excluir pagamento com comprovante", motivo e a palavra
 * EXCLUIR. Os arquivos ficam guardados e tudo o que saiu vai para o log.
 */
export async function deletePaidPayment(
  commitmentId: string,
  reason: string,
  confirmWord: string,
): Promise<ActionState> {
  const session = await requireUser();
  if (!(await canDeletePaidPayment())) {
    await logPlanningAction({
      actorUserId: session.id,
      action: "planning.paid_payment_delete_denied",
      entityType: "RubricCommitment",
      entityId: commitmentId,
    });
    return {
      error:
        'Sem permissão para excluir pagamento. Peça a permissão "Excluir pagamento com comprovante" no MAX Cultural.',
    };
  }
  const motivo = reason.trim();
  if (motivo.length < 10) return { error: "Explique o motivo da exclusão (fica registrado)." };
  if (confirmWord.trim().toUpperCase() !== CONFIRM_WORD) {
    return { error: `Digite ${CONFIRM_WORD} para confirmar.` };
  }
  const { entitlements } = await getWorkspaceContext();

  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id: commitmentId, workspaceId: entitlements.workspaceId },
    include: {
      planningProject: { select: { id: true, externalCode: true, closedAt: true } },
      pedido: { select: { id: true, sourceDocumentId: true } },
    },
  });
  if (!commitment) return { error: "Lançamento não encontrado." };
  if (commitment.status !== "PAID") return { error: "Só lançamentos pagos são excluídos por aqui." };
  if (commitment.planningProject.closedAt) {
    return { error: "O projeto está encerrado: não é possível excluir pagamentos." };
  }
  const projectId = commitment.planningProjectId;

  // Comprovantes deste pagamento (e das outras rubricas do mesmo rateio).
  const proofs = await prisma.planningDocument.findMany({
    where: {
      workspaceId: entitlements.workspaceId,
      kind: { in: ["PAYMENT_PROOF", "TAX_PROOF"] },
      OR: [{ commitmentId: commitment.id }, { allocations: { some: { commitmentId: commitment.id } } }],
    },
    include: { allocations: { select: { commitmentId: true } } },
  });
  const groupIds = new Set<string>([commitment.id]);
  for (const p of proofs) {
    for (const a of p.allocations) groupIds.add(a.commitmentId);
    if (p.commitmentId) groupIds.add(p.commitmentId);
  }

  // NF/RPA do lançamento. A NF de um pedido fica: é das outras parcelas também.
  const fiscalDocs = await prisma.planningDocument.findMany({
    where: {
      workspaceId: entitlements.workspaceId,
      kind: { in: ["NF", "RPA"] },
      OR: [
        { commitmentId: { in: [...groupIds] } },
        { allocations: { some: { commitmentId: { in: [...groupIds] } } } },
      ],
      ...(commitment.pedido?.sourceDocumentId
        ? { id: { not: commitment.pedido.sourceDocumentId } }
        : {}),
    },
    include: { allocations: { select: { commitmentId: true } } },
  });
  for (const d of fiscalDocs) for (const a of d.allocations) groupIds.add(a.commitmentId);

  const group = await prisma.rubricCommitment.findMany({
    where: { id: { in: [...groupIds] }, workspaceId: entitlements.workspaceId },
    include: {
      budgetLine: { select: { itemName: true } },
      engagement: {
        select: { id: true, source: true, service: { select: { supplier: { select: { name: true, cnpj: true } } } } },
      },
    },
  });
  if (group.some((c) => c.planningProjectId !== projectId)) {
    return { error: "Este pagamento está ligado a outro projeto. Nada foi excluído." };
  }

  // 1) SALIC primeiro: se falhar lá, nada sai do sistema (os dois continuam iguais).
  const salicIds = [...new Set(proofs.map((p) => p.salicComprovanteId).filter(Boolean) as string[])];
  const goneInSalic = new Set(
    (
      await prisma.salicPaymentRecord.findMany({
        where: { planningProjectId: projectId, externalId: { in: salicIds }, removedAt: { not: null } },
        select: { externalId: true },
      })
    ).map((r) => r.externalId),
  );
  const deletedInSalic: string[] = [];
  for (const salicId of salicIds) {
    if (goneInSalic.has(salicId)) continue;
    try {
      await deleteSalicComprovante({
        planningProjectId: projectId,
        externalCode: commitment.planningProject.externalCode,
        salicComprovanteId: salicId,
      });
      deletedInSalic.push(salicId);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await logPlanningAction({
        actorUserId: session.id,
        action: "planning.paid_payment_delete_salic_failed",
        entityType: "RubricCommitment",
        entityId: commitment.id,
        meta: { planningProjectId: projectId, salicComprovanteId: salicId, deletedInSalic, detail, reason: motivo },
      });
      return {
        error:
          deletedInSalic.length > 0
            ? `O SALIC excluiu ${deletedInSalic.length} comprovante(s), mas falhou no seguinte: ${detail}. Nada foi apagado no sistema; tente de novo.`
            : `Não foi possível excluir no SALIC: ${detail}. Nada foi apagado no sistema.`,
      };
    }
  }

  // 2) Sistema. Os arquivos ficam no armazenamento; o log guarda onde estão.
  const docs = [...proofs, ...fiscalDocs];
  const docIds = docs.map((d) => d.id);
  const commitmentIds = group.map((c) => c.id);
  const engagementIds = group
    .filter((c) => (PLANNING_SOURCES as readonly string[]).includes(c.engagement.source))
    .map((c) => c.engagement.id);
  const snapshot = {
    commitments: group.map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      budgetLineId: c.budgetLineId,
      rubrica: c.budgetLine.itemName,
      supplier: c.engagement.service.supplier.name,
      supplierDoc: c.engagement.service.supplier.cnpj,
      paidAt: c.paidAt?.toISOString() ?? null,
      pedidoId: c.pedidoId,
      isReimbursement: c.isReimbursement,
      hasBond: c.hasBond,
    })),
    documents: docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      filename: d.filename,
      storagePath: d.storagePath,
      grossAmount: d.grossAmount != null ? Number(d.grossAmount) : null,
      salicComprovanteId: d.salicComprovanteId,
    })),
  };

  const { paymentAlertHrefsForCommitment } = await import("@/lib/planning/payment-alerts");
  await prisma.$transaction(async (tx) => {
    await tx.documentRubricAllocation.deleteMany({
      where: { OR: [{ documentId: { in: docIds } }, { commitmentId: { in: commitmentIds } }] },
    });
    await tx.appNotification.deleteMany({
      where: {
        workspaceId: entitlements.workspaceId,
        href: { in: commitmentIds.flatMap((id) => paymentAlertHrefsForCommitment(id)) },
      },
    });
    await tx.salicPaymentRecord.updateMany({
      where: { planningProjectId: projectId, linkedProofId: { in: docIds } },
      data: { linkedProofId: null, resolvedAt: new Date() },
    });
    if (deletedInSalic.length) {
      await tx.salicPaymentRecord.updateMany({
        where: { planningProjectId: projectId, externalId: { in: deletedInSalic } },
        data: { removedAt: new Date(), resolvedAt: new Date() },
      });
    }
    // Comprovantes antes da NF (sourceDocumentId aponta para ela).
    await tx.planningDocument.deleteMany({ where: { id: { in: proofs.map((p) => p.id) } } });
    await tx.planningDocument.deleteMany({ where: { id: { in: fiscalDocs.map((d) => d.id) } } });
    await tx.rubricCommitment.deleteMany({ where: { id: { in: commitmentIds } } });
    if (engagementIds.length) {
      await tx.catalogEngagement.deleteMany({
        where: { id: { in: engagementIds }, workspaceId: entitlements.workspaceId },
      });
    }
  });

  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.paid_payment_deleted",
    entityType: "RubricCommitment",
    entityId: commitment.id,
    meta: {
      planningProjectId: projectId,
      reason: motivo,
      deletedInSalic,
      alreadyGoneInSalic: [...goneInSalic],
      ...snapshot,
    },
  });

  revalidatePath(`/planejamento/${projectId}`);
  revalidatePath(`/planejamento/${projectId}/reservas`);
  revalidatePath(`/planejamento/${projectId}/pendencias`);
  revalidatePath("/fornecedores/contratacoes");
  const salicMsg = deletedInSalic.length ? " Também foi excluído no SALIC." : "";
  return { ok: true, message: `Pagamento excluído.${salicMsg}` };
}
