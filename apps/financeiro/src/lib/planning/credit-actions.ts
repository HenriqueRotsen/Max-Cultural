"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { normalizeCgccpf, parseBrMoney } from "@/lib/format";
import { logPlanningAction } from "@/lib/activity-audit";
import { enforcePronacMatch } from "@/lib/planning/pronac-override";
import { resolvePaymentDate } from "@/lib/planning/payment-date";
import { revalidatePlanning } from "@/lib/planning/server-utils";
import { buildPlanningDocumentFilename } from "@/lib/nf/document-filename";
import {
  DuplicateDocumentError,
  duplicateFileMessage,
  persistPlanningUpload,
} from "@/lib/nf/persist-upload";
import { extractProofFromBuffer } from "@/lib/nf/extract";
import { checkProjectCodeInDocument } from "@/lib/nf/document-cross-check";
import type { ActionState } from "@/lib/planning/action-state";
import {
  CREDIT_TOLERANCE,
  creditRemaining,
  fiscalRemaining,
  scaleAllocationsToAmount,
  validateCreditUse,
} from "@/lib/planning/credits";
import { loadFiscalCreditStatus } from "@/lib/planning/credits-db";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function revalidateCredits(planningProjectId: string, commitmentId?: string) {
  revalidatePlanning(planningProjectId);
  revalidatePath(`/planejamento/${planningProjectId}/creditos`);
  if (commitmentId) revalidatePath(`/planejamento/compromissos/${commitmentId}`);
}

/**
 * Novo crédito: comprovante de um pagamento feito sem nota. Não entra em
 * rubrica nem no SALIC até uma nota usar o crédito.
 */
export async function createPaymentCredit(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true, closedAt: true },
  });
  if (!project) return { error: "Projeto não encontrado" };
  if (project.closedAt) return { error: "O projeto está encerrado: não entram pagamentos novos." };

  const supplierName = String(formData.get("supplierName") || "").trim();
  const cnpj = normalizeCgccpf(String(formData.get("cnpj") || ""));
  if (!supplierName || !(cnpj.length === 11 || cnpj.length === 14)) {
    return { error: "Informe o fornecedor e o CPF/CNPJ de quem recebeu." };
  }
  const file = formData.get("proofFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o comprovante de pagamento." };
  }
  const notes = String(formData.get("notes") || "").trim() || null;
  const mimeType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractProofFromBuffer({ buffer, filename: file.name, mimeType });

  // Valor: o lido no comprovante; quem digita outro corrige a leitura (fica no log).
  const typed = parseBrMoney(String(formData.get("amount") || "")) || 0;
  const read = extracted.amount && extracted.amount > 0 ? extracted.amount : 0;
  const amount = typed > 0 ? typed : read;
  if (!(amount > 0)) {
    return { error: "Não deu para ler o valor no comprovante. Informe o valor pago." };
  }
  const corrected = read > 0 && Math.abs(read - amount) > CREDIT_TOLERANCE;

  const paidDate = resolvePaymentDate({
    extracted: extracted.paymentDate,
    typed: String(formData.get("paidAt") || ""),
  });
  if ("error" in paidDate) return { error: paidDate.error };

  const projectCheck = checkProjectCodeInDocument({
    text: extracted.rawText,
    expectedCode: project.externalCode,
    extractedPronac: extracted.pronac,
  });
  const pronacGate = await enforcePronacMatch({ mismatch: projectCheck.warning, formData });
  if (!pronacGate.ok) return { error: pronacGate.error, pronacOverride: pronacGate.pronacOverride };

  const filename = buildPlanningDocumentFilename({
    kind: "PAYMENT_PROOF",
    projectCode: project.externalCode,
    supplierName,
    supplierDoc: cnpj,
    hiredAt: paidDate.date.toISOString().slice(0, 10),
    amount,
    originalFilename: file.name,
    mimeType,
  });

  let stored;
  try {
    stored = await persistPlanningUpload({
      buffer,
      filename,
      mimeType,
      workspaceId: entitlements.workspaceId,
      // O mesmo comprovante não paga dois PRONACs nem vira dois créditos.
      rejectDuplicate: { kinds: ["PAYMENT_PROOF"] },
    });
  } catch (e) {
    if (e instanceof DuplicateDocumentError) return { error: await duplicateFileMessage(e.duplicate) };
    throw e;
  }

  const supplier = await prisma.catalogSupplier.upsert({
    where: { workspaceId_cnpj: { workspaceId: entitlements.workspaceId, cnpj } },
    create: { workspaceId: entitlements.workspaceId, cnpj, name: supplierName },
    update: {},
  });

  // O texto inteiro do PDF não precisa ficar guardado no crédito.
  const extractedRest = { ...extracted, rawText: undefined };
  const credit = await prisma.paymentCredit.create({
    data: {
      workspaceId: entitlements.workspaceId,
      planningProjectId: project.id,
      supplierId: supplier.id,
      amount,
      paidAt: paidDate.date,
      filename,
      mimeType,
      storagePath: stored.storagePath,
      byteSize: stored.byteSize,
      originalByteSize: stored.originalByteSize,
      contentHash: stored.contentHash,
      extractedJson: {
        ...extractedRest,
        ...(corrected ? { paymentReview: { extractedAmount: read, paidAmount: amount, corrected: true } } : {}),
      } as object,
      notes: [notes, pronacGate.overrideReason ? `Liberado: ${pronacGate.overrideReason}` : null]
        .filter(Boolean)
        .join(" · ") || null,
      createdById: session.id,
    },
  });

  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.credit_created",
    entityType: "PaymentCredit",
    entityId: credit.id,
    meta: {
      planningProjectId: project.id,
      amount,
      extractedAmount: read || null,
      corrected,
      pronacOverride: pronacGate.overrideReason,
    },
  });
  revalidateCredits(project.id);
  return {
    ok: true,
    message: `Crédito de ${brl(amount)} para ${supplierName} registrado. Use-o ao lançar as notas.`,
  };
}

/**
 * Usa parte de um crédito para pagar a nota desta reserva. Cada uso vira um
 * comprovante próprio (mesmo arquivo), rateado como a nota, e um lançamento
 * no SALIC. A reserva fica paga quando a soma fecha o valor da nota.
 */
export async function applyPaymentCredit(
  commitmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const creditId = String(formData.get("creditId") || "");
  const amount = parseBrMoney(String(formData.get("amount") || "")) || 0;

  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id: commitmentId, workspaceId: entitlements.workspaceId },
    select: {
      id: true,
      status: true,
      pedidoId: true,
      engagementId: true,
      planningProjectId: true,
      planningProject: { select: { closedAt: true, externalCode: true } },
      engagement: { select: { service: { select: { supplier: { select: { cnpj: true, name: true } } } } } },
    },
  });
  if (!commitment) return { error: "Reserva não encontrada" };
  if (commitment.status !== "RESERVED") return { error: "Esta reserva não está aguardando pagamento." };
  if (commitment.planningProject.closedAt) {
    return { error: "O projeto está encerrado: não entram pagamentos novos." };
  }
  if (commitment.pedidoId) {
    return { error: "Parcela de pedido: registre o comprovante da parcela." };
  }

  const status = await loadFiscalCreditStatus(commitment.id, entitlements.workspaceId);
  if (!status) {
    return { error: "Confirme a NF/RPA desta reserva antes de usar um crédito." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Trava o crédito: dois usos ao mesmo tempo não passam do saldo.
      await tx.$executeRaw`SELECT id FROM payment_credits WHERE id = ${creditId} FOR UPDATE`;
      const credit = await tx.paymentCredit.findFirst({
        where: {
          id: creditId,
          workspaceId: entitlements.workspaceId,
          planningProjectId: commitment.planningProjectId,
        },
        include: { uses: { select: { amount: true } }, supplier: { select: { cnpj: true, name: true } } },
      });
      if (!credit) throw new Error("CREDIT:Crédito não encontrado neste projeto.");
      if (credit.supplier.cnpj !== commitment.engagement.service.supplier.cnpj) {
        throw new Error(
          `CREDIT:O crédito é de ${credit.supplier.name}, e esta nota é de ${commitment.engagement.service.supplier.name}.`,
        );
      }
      const creditLeft = creditRemaining(
        Number(credit.amount),
        credit.uses.map((u) => ({ amount: Number(u.amount) })),
      );
      // Relê o que já foi pago da nota dentro da transação.
      const paidAgg = await tx.paymentCreditUse.aggregate({
        where: { proof: { sourceDocumentId: status.nf.id } },
        _sum: { amount: true },
      });
      const nfLeft = fiscalRemaining(status.expected, Number(paidAgg._sum.amount || 0));
      const invalid = validateCreditUse({ amount, creditLeft, nfLeft });
      if (invalid) throw new Error(`CREDIT:${invalid}`);

      const slices = scaleAllocationsToAmount(status.nf.allocations, amount);
      const proof = await tx.planningDocument.create({
        data: {
          kind: "PAYMENT_PROOF",
          status: "IMPORTED",
          filename: credit.filename,
          mimeType: credit.mimeType,
          storagePath: credit.storagePath,
          byteSize: credit.byteSize,
          originalByteSize: credit.originalByteSize,
          contentHash: credit.contentHash,
          extractedJson: {
            ...((credit.extractedJson as object | null) ?? {}),
            amount,
            paymentDate: credit.paidAt.toISOString().slice(0, 10),
            creditId: credit.id,
            creditAmount: Number(credit.amount),
          } as object,
          grossAmount: amount,
          workspaceId: entitlements.workspaceId,
          planningProjectId: commitment.planningProjectId,
          engagementId: commitment.engagementId,
          commitmentId: commitment.id,
          sourceDocumentId: status.nf.id,
        },
      });
      for (const s of slices) {
        await tx.documentRubricAllocation.create({
          data: {
            documentId: proof.id,
            budgetLineId: s.budgetLineId,
            commitmentId: s.commitmentId,
            sharePct: s.sharePct,
            amount: s.amount,
          },
        });
      }
      const use = await tx.paymentCreditUse.create({
        data: { creditId: credit.id, proofDocumentId: proof.id, amount, createdById: session.id },
      });

      const paidNow = nfLeft - amount <= CREDIT_TOLERANCE;
      if (paidNow) {
        const ids = [...new Set(status.nf.allocations.map((a) => a.commitmentId))];
        // Data do pagamento: a do último crédito que fechou a nota.
        await tx.rubricCommitment.updateMany({
          where: { id: { in: ids }, workspaceId: entitlements.workspaceId, status: "RESERVED" },
          data: { status: "PAID", paidAt: credit.paidAt },
        });
        const { paymentAlertHrefsForCommitment } = await import("@/lib/planning/payment-alerts");
        await tx.appNotification.deleteMany({
          where: {
            workspaceId: entitlements.workspaceId,
            href: { in: ids.flatMap((id) => paymentAlertHrefsForCommitment(id)) },
            type: { in: ["PAYMENT_OVERDUE", "PAYMENT_DUE_SOON"] },
          },
        });
      }
      return { useId: use.id, creditLeft: creditLeft - amount, nfLeft: nfLeft - amount, paidNow };
    });

    await logPlanningAction({
      actorUserId: session.id,
      action: "planning.credit_used",
      entityType: "PaymentCredit",
      entityId: creditId,
      meta: {
        planningProjectId: commitment.planningProjectId,
        commitmentId: commitment.id,
        fiscalDocumentId: status.nf.id,
        useId: result.useId,
        amount,
      },
    });
    revalidateCredits(commitment.planningProjectId, commitment.id);
    const rest =
      result.creditLeft > CREDIT_TOLERANCE ? ` Sobram ${brl(result.creditLeft)} no crédito.` : " O crédito acabou.";
    return {
      ok: true,
      message: result.paidNow
        ? `Nota paga com o crédito (${brl(amount)}).${rest}`
        : `${brl(amount)} do crédito usados. Falta pagar ${brl(Math.max(0, result.nfLeft))} desta nota.${rest}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("CREDIT:")) return { error: msg.slice("CREDIT:".length) };
    throw err;
  }
}

/**
 * Desfaz um uso de crédito (o valor volta para o crédito). Se o comprovante
 * já foi ao SALIC, tem que sair de lá antes.
 */
export async function undoPaymentCreditUse(useId: string): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const use = await prisma.paymentCreditUse.findFirst({
    where: { id: useId, credit: { workspaceId: entitlements.workspaceId } },
    include: {
      credit: { select: { id: true, planningProjectId: true, planningProject: { select: { closedAt: true } } } },
      proof: { select: { id: true, salicComprovanteId: true, commitmentId: true, sourceDocumentId: true } },
    },
  });
  if (!use) return { error: "Uso do crédito não encontrado" };
  if (use.credit.planningProject.closedAt) return { error: "O projeto está encerrado." };
  if (use.proof.salicComprovanteId) {
    return { error: "Este comprovante já está no SALIC. Exclua de lá primeiro (aba SALIC) e desfaça depois." };
  }
  const nfId = use.proof.sourceDocumentId;
  if (nfId) {
    // Nota fechada com outro comprovante (sem crédito): desfaça esse pagamento antes.
    const otherProofs = await prisma.planningDocument.count({
      where: { kind: "PAYMENT_PROOF", sourceDocumentId: nfId, id: { not: use.proof.id }, creditUse: null },
    });
    if (otherProofs > 0) {
      return { error: "Esta nota também tem um comprovante pago sem crédito. Exclua esse pagamento antes." };
    }
  }
  await prisma.$transaction(async (tx) => {
    if (nfId) {
      const nfAllocs = await tx.documentRubricAllocation.findMany({
        where: { documentId: nfId },
        select: { commitmentId: true },
      });
      const ids = [...new Set(nfAllocs.map((a) => a.commitmentId))];
      // Sem este uso a nota deixa de fechar: volta a aguardar pagamento.
      if (ids.length) {
        await tx.rubricCommitment.updateMany({
          where: { id: { in: ids }, status: "PAID" },
          data: { status: "RESERVED", paidAt: null },
        });
      }
    }
    await tx.planningDocument.delete({ where: { id: use.proof.id } });
  });
  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.credit_use_undone",
    entityType: "PaymentCredit",
    entityId: use.credit.id,
    meta: { planningProjectId: use.credit.planningProjectId, amount: Number(use.amount) },
  });
  revalidateCredits(use.credit.planningProjectId, use.proof.commitmentId ?? undefined);
  return { ok: true, message: `${brl(Number(use.amount))} voltaram para o crédito.` };
}

/** Exclui um crédito que ainda não foi usado. */
export async function deletePaymentCredit(creditId: string): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const credit = await prisma.paymentCredit.findFirst({
    where: { id: creditId, workspaceId: entitlements.workspaceId },
    include: { _count: { select: { uses: true } } },
  });
  if (!credit) return { error: "Crédito não encontrado" };
  if (credit._count.uses > 0) {
    return { error: "Este crédito já foi usado por notas. Desfaça os usos antes de excluir." };
  }
  await prisma.paymentCredit.delete({ where: { id: credit.id } });
  const shared = await prisma.planningDocument.count({ where: { storagePath: credit.storagePath } });
  if (shared === 0) {
    const { deleteObject } = await import("@/lib/storage/object-store");
    await deleteObject(credit.storagePath).catch(() => {});
  }
  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.credit_deleted",
    entityType: "PaymentCredit",
    entityId: credit.id,
    meta: { planningProjectId: credit.planningProjectId, amount: Number(credit.amount) },
  });
  revalidateCredits(credit.planningProjectId);
  return { ok: true, message: "Crédito excluído." };
}
