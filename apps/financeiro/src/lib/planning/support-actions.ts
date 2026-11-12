"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { logPlanningAction } from "@/lib/activity-audit";
import { canDeleteNf } from "@/lib/planning/acl";
import { extractProofFromBuffer } from "@/lib/nf/extract";
import { buildPlanningDocumentFilename } from "@/lib/nf/document-filename";
import {
  DuplicateDocumentError,
  duplicateFileMessage,
  persistPlanningUpload,
} from "@/lib/nf/persist-upload";
import { checkProjectCodeInDocument } from "@/lib/nf/document-cross-check";
import { normalizeCgccpf, formatCurrency, formatDate } from "@/lib/format";
import { enforcePronacMatch } from "@/lib/planning/pronac-override";
import { revalidatePlanning } from "@/lib/planning/server-utils";
import {
  SUPPORT_LABEL,
  cnpjsInText,
  isSupportType,
  readBoletoLine,
  replacesNf,
  supportNumberFromText,
} from "@/lib/planning/support-docs";
import type { ActionState } from "@/lib/planning/action-state";

/** Lançamentos do mesmo pagamento (rateio): os que dividem NF ou comprovante. */
async function paymentGroupIds(commitmentId: string): Promise<string[]> {
  const docs = await prisma.planningDocument.findMany({
    where: {
      kind: { in: ["NF", "RPA", "PAYMENT_PROOF"] },
      OR: [{ commitmentId }, { allocations: { some: { commitmentId } } }],
    },
    select: { commitmentId: true, allocations: { select: { commitmentId: true } } },
  });
  const ids = new Set<string>([commitmentId]);
  for (const d of docs) {
    if (d.commitmentId) ids.add(d.commitmentId);
    for (const a of d.allocations) ids.add(a.commitmentId);
  }
  return [...ids];
}

/**
 * O documento muda o PDF do SALIC: comprovantes já enviados deste pagamento
 * ficam marcados para reenviar (o envio troca o que está lá pelo PDF novo).
 */
async function markGroupForRepublish(groupIds: string[]): Promise<number> {
  const r = await prisma.planningDocument.updateMany({
    where: {
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: { not: null },
      OR: [{ commitmentId: { in: groupIds } }, { allocations: { some: { commitmentId: { in: groupIds } } } }],
    },
    data: { salicRepublishPending: true },
  });
  return r.count;
}

/**
 * Anexa um documento de apoio (boleto, fatura, recibo, contrato, apólice ou
 * orçamento) ao lançamento. Lê o que der do arquivo (valor, vencimento do
 * boleto, número, CNPJs) para conferir; documento de outro PRONAC é barrado
 * como a NF. Se o pagamento já está no SALIC, fica para reenviar com o PDF novo.
 */
export async function attachSupportDocument(
  commitmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const type = String(formData.get("supportType") || "");
  if (!isSupportType(type)) return { error: "Escolha o tipo do documento." };
  const file = formData.get("supportFile");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo." };

  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id: commitmentId, workspaceId: entitlements.workspaceId },
    include: {
      planningProject: { select: { id: true, externalCode: true, closedAt: true } },
      engagement: { select: { id: true, service: { select: { supplier: { select: { name: true, cnpj: true } } } } } },
    },
  });
  if (!commitment) return { error: "Lançamento não encontrado." };
  if (commitment.status === "CANCELLED") return { error: "Lançamento cancelado." };
  if (commitment.planningProject.closedAt) return { error: "O projeto está encerrado." };
  const supplier = commitment.engagement.service.supplier;
  const mimeType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());

  const extracted = await extractProofFromBuffer({ buffer, filename: file.name, mimeType });
  const text = extracted.rawText || "";
  const boleto = type === "BOLETO" ? readBoletoLine(text) : null;

  // Trava do PRONAC (igual à NF e ao comprovante).
  const projectCheck = checkProjectCodeInDocument({
    text,
    expectedCode: commitment.planningProject.externalCode,
    extractedPronac: extracted.pronac,
  });
  const pronacGate = await enforcePronacMatch({ mismatch: projectCheck.warning, formData });
  if (!pronacGate.ok) return { error: pronacGate.error, pronacOverride: pronacGate.pronacOverride };

  // Fatura, recibo, apólice ou contrato podem fazer o papel da NF/RPA.
  const substitutesNf = replacesNf(type) && formData.get("replacesNf") === "on";
  const warnings: string[] = [];
  const supplierDoc = normalizeCgccpf(supplier.cnpj);
  const cnpjs = cnpjsInText(text);
  if (supplierDoc.length === 14 && cnpjs.length > 0 && !cnpjs.includes(supplierDoc)) {
    warnings.push(`O CNPJ de ${supplier.name} não aparece no documento. Confira se é deste fornecedor.`);
  }
  const amount = boleto?.amount ?? extracted.amount ?? null;
  if (type === "BOLETO" && amount && Math.abs(amount - Number(commitment.amount)) > 0.02) {
    warnings.push(
      `Valor do boleto (${formatCurrency(amount)}) diferente do lançamento (${formatCurrency(Number(commitment.amount))}).`,
    );
  }

  const displayName = buildPlanningDocumentFilename({
        kind: "SUPPORT",
        supportType: type,
        projectCode: commitment.planningProject.externalCode,
        supplierName: supplier.name,
        supplierDoc: supplier.cnpj,
        amount,
        originalFilename: file.name,
        mimeType,
      });
  let stored;
  try {
    stored = await persistPlanningUpload({
      buffer,
      filename: displayName,
      mimeType,
      workspaceId: entitlements.workspaceId,
      // Boleto é pago uma vez só: o mesmo arquivo não entra em outro lançamento.
      rejectDuplicate: type === "BOLETO" ? { kinds: ["SUPPORT"] } : undefined,
    });
  } catch (e) {
    if (e instanceof DuplicateDocumentError) return { error: await duplicateFileMessage(e.duplicate) };
    throw e;
  }

  const groupIds = await paymentGroupIds(commitment.id);
  const doc = await prisma.planningDocument.create({
    data: {
      kind: "SUPPORT",
      supportType: type,
      status: "IMPORTED",
      filename: displayName,
      mimeType,
      storagePath: stored.storagePath,
      byteSize: stored.byteSize,
      originalByteSize: stored.originalByteSize,
      contentHash: stored.contentHash,
      grossAmount: amount,
      extractedJson: {
        documentNumber: supportNumberFromText(type, text),
        boletoDueDate: boleto?.dueDate ?? null,
        boletoLine: boleto?.line ?? null,
        cnpjs,
        warnings,
        replacesNf: substitutesNf,
        pronacOverride: pronacGate.overrideReason,
      },
      errorMessage: warnings.join(" · ") || null,
      workspaceId: entitlements.workspaceId,
      planningProjectId: commitment.planningProjectId,
      engagementId: commitment.engagement.id,
      commitmentId: commitment.id,
    },
  });

  // Boleto de reserva: o vencimento vira a data prevista do pagamento.
  let dueMsg = "";
  if (boleto?.dueDate && commitment.status === "RESERVED") {
    const due = new Date(`${boleto.dueDate}T12:00:00Z`);
    await prisma.rubricCommitment.updateMany({
      where: { id: { in: groupIds }, status: "RESERVED" },
      data: { expectedPayAt: due },
    });
    dueMsg = ` Vencimento do boleto (${formatDate(due)}) virou a data prevista de pagamento.`;
  }
  let nfMsg = "";
  if (substitutesNf) {
    const r = await prisma.rubricCommitment.updateMany({
      where: { id: { in: groupIds }, nfPending: true },
      data: { nfPending: false },
    });
    if (r.count > 0) nfMsg = ` Ele faz o papel da NF/RPA: o lançamento não está mais com NF pendente.`;
  }
  const republish = await markGroupForRepublish(groupIds);

  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.support_document_attached",
    entityType: "PlanningDocument",
    entityId: doc.id,
    meta: {
      planningProjectId: commitment.planningProjectId,
      commitmentId: commitment.id,
      supportType: type,
      replacesNf: substitutesNf,
      ...(pronacGate.overrideReason ? { pronacOverride: pronacGate.overrideReason } : {}),
    },
  });
  revalidatePlanning(commitment.planningProjectId);
  revalidatePath(`/planejamento/compromissos/${commitment.id}`);
  const parts = [`${SUPPORT_LABEL[type]} anexado.${dueMsg}${nfMsg}`];
  if (republish > 0) parts.push("O pagamento já estava no SALIC: reenvie em Reservas para o PDF incluir este documento.");
  if (warnings.length) parts.push(`Atenção: ${warnings.join(" ")}`);
  return { ok: true, message: parts.join(" ") };
}

/** Tira um documento de apoio do lançamento (mesma permissão de excluir NF/RPA). */
export async function removeSupportDocument(documentId: string): Promise<ActionState> {
  const session = await requireUser();
  if (!(await canDeleteNf())) {
    return { error: 'Sem permissão. Peça a permissão "Excluir NF/RPA" no MAX Cultural.' };
  }
  const { entitlements } = await getWorkspaceContext();
  const doc = await prisma.planningDocument.findFirst({
    where: { id: documentId, workspaceId: entitlements.workspaceId, kind: "SUPPORT" },
  });
  if (!doc?.commitmentId) return { error: "Documento não encontrado." };
  const groupIds = await paymentGroupIds(doc.commitmentId);
  await prisma.planningDocument.delete({ where: { id: doc.id } });
  // Era o substituto da NF: sem NF/RPA e sem outro substituto, a NF volta a ficar pendente.
  if ((doc.extractedJson as { replacesNf?: boolean } | null)?.replacesNf) {
    const [fiscal, others] = await Promise.all([
      prisma.planningDocument.count({
        where: {
          kind: { in: ["NF", "RPA"] },
          status: "IMPORTED",
          OR: [{ commitmentId: { in: groupIds } }, { allocations: { some: { commitmentId: { in: groupIds } } } }],
        },
      }),
      prisma.planningDocument.findMany({
        where: { kind: "SUPPORT", commitmentId: { in: groupIds } },
        select: { extractedJson: true },
      }),
    ]);
    const stillReplaced = others.some(
      (o) => (o.extractedJson as { replacesNf?: boolean } | null)?.replacesNf === true,
    );
    if (fiscal === 0 && !stillReplaced) {
      await prisma.rubricCommitment.updateMany({
        where: { id: { in: groupIds }, status: "PAID" },
        data: { nfPending: true },
      });
    }
  }
  const republish = await markGroupForRepublish(groupIds);
  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.support_document_removed",
    entityType: "PlanningDocument",
    entityId: doc.id,
    meta: {
      planningProjectId: doc.planningProjectId,
      commitmentId: doc.commitmentId,
      supportType: doc.supportType,
      filename: doc.filename,
      storagePath: doc.storagePath,
    },
  });
  if (doc.planningProjectId) revalidatePlanning(doc.planningProjectId);
  revalidatePath(`/planejamento/compromissos/${doc.commitmentId}`);
  return {
    ok: true,
    message:
      "Documento removido." +
      (republish > 0 ? " O pagamento já estava no SALIC: reenvie em Reservas para atualizar o PDF." : ""),
  };
}
