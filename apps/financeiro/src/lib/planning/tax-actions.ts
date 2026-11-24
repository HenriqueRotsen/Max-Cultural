"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { logPlanningAction } from "@/lib/activity-audit";
import { revalidatePlanning } from "@/lib/planning/server-utils";
import { enforcePronacMatch } from "@/lib/planning/pronac-override";
import { buildPlanningDocumentFilename } from "@/lib/nf/document-filename";
import { persistPlanningUpload } from "@/lib/nf/persist-upload";
import { hashDocumentContent } from "@/lib/nf/document-hash";
import { extractProofFromBuffer } from "@/lib/nf/extract";
import { checkProjectCodeInDocument } from "@/lib/nf/document-cross-check";
import type { ActionState } from "@/lib/planning/action-state";
import {
  TAX_DOC_TYPES,
  TAX_KIND_LABELS,
  isTaxKind,
  retainedTaxes,
  type TaxDocType,
} from "@/lib/planning/tax-docs";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Imposto de um pagamento: guia, nota fiscal do imposto e comprovante do
 * pagamento do imposto, ligados à NF/RPA escolhida (mesmo rateio dela).
 */
export async function uploadTaxDocuments(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const nfId = String(formData.get("nfId") || "");
  const taxKind = String(formData.get("taxKind") || "");
  if (!nfId) return { error: "Escolha o pagamento do imposto." };
  if (!isTaxKind(taxKind)) return { error: "Escolha qual imposto." };

  const files: Array<{ type: TaxDocType; file: File }> = [];
  for (const [type, field, required] of [
    ["GUIA", "guiaFile", true],
    ["NF_IMPOSTO", "taxNfFile", false],
    ["COMPROVANTE", "proofFile", true],
  ] as const) {
    const f = formData.get(field);
    if (f instanceof File && f.size > 0) files.push({ type, file: f });
    else if (required) return { error: `Anexe: ${TAX_DOC_TYPES[type].toLowerCase()}.` };
  }

  const nf = await prisma.planningDocument.findFirst({
    where: {
      id: nfId,
      workspaceId: entitlements.workspaceId,
      planningProjectId,
      kind: { in: ["NF", "RPA"] },
      status: "IMPORTED",
    },
    include: {
      planningProject: { select: { externalCode: true, closedAt: true } },
      allocations: true,
      commitment: {
        select: { engagement: { select: { service: { select: { supplier: { select: { name: true, cnpj: true } } } } } } },
      },
    },
  });
  if (!nf || !nf.planningProject) return { error: "Pagamento não encontrado neste projeto." };
  if (nf.planningProject.closedAt) return { error: "O projeto está encerrado." };
  if (nf.allocations.length === 0) return { error: "Esta nota ainda não tem rubrica." };

  const expected = retainedTaxes(nf.taxesJson).find((t) => t.kind === taxKind);
  const warnings: string[] = [];
  if (!expected) {
    warnings.push(`A nota não mostra ${TAX_KIND_LABELS[taxKind]} retido; confira se é o pagamento certo.`);
  }

  // Comprovante: trava do PRONAC e conferência do valor (só aviso).
  const proofEntry = files.find((f) => f.type === "COMPROVANTE")!;
  const proofBuffer = Buffer.from(await proofEntry.file.arrayBuffer());
  const proofRead = await extractProofFromBuffer({
    buffer: proofBuffer,
    filename: proofEntry.file.name,
    mimeType: proofEntry.file.type || "application/octet-stream",
  });
  const projectCheck = checkProjectCodeInDocument({
    text: proofRead.rawText,
    expectedCode: nf.planningProject.externalCode,
    extractedPronac: proofRead.pronac,
  });
  const pronacGate = await enforcePronacMatch({ mismatch: projectCheck.warning, formData });
  if (!pronacGate.ok) return { error: pronacGate.error, pronacOverride: pronacGate.pronacOverride };
  if (expected && proofRead.amount && Math.abs(proofRead.amount - expected.amount) > 0.02) {
    warnings.push(
      `O comprovante mostra ${brl(proofRead.amount)} e a nota retém ${brl(expected.amount)} de ${expected.label}. Confira se a guia junta mais de um pagamento.`,
    );
  }

  const supplier = nf.commitment?.engagement.service.supplier;
  const buffers = await Promise.all(
    files.map(async (f) => ({
      ...f,
      buffer: f.type === "COMPROVANTE" ? proofBuffer : Buffer.from(await f.file.arrayBuffer()),
    })),
  );
  // O mesmo arquivo não entra duas vezes no mesmo pagamento (pode valer para
  // outro pagamento: uma guia às vezes junta vários).
  for (const f of buffers) {
    const dup = await prisma.planningDocument.findFirst({
      where: {
        workspaceId: entitlements.workspaceId,
        kind: "TAX_PROOF",
        sourceDocumentId: nf.id,
        contentHash: hashDocumentContent(f.buffer),
      },
      select: { id: true },
    });
    if (dup) return { error: `${TAX_DOC_TYPES[f.type]}: este arquivo já está neste pagamento.` };
  }

  const stored: Array<
    (typeof buffers)[number] & Awaited<ReturnType<typeof persistPlanningUpload>> & { filename: string; mimeType: string }
  > = [];
  for (const f of buffers) {
    const mimeType = f.file.type || "application/octet-stream";
    const filename = buildPlanningDocumentFilename({
      kind: "TAX_PROOF",
      projectCode: nf.planningProject.externalCode,
      supplierName: supplier?.name ?? "imposto",
      supplierDoc: supplier?.cnpj ?? "",
      hiredAt: new Date().toISOString().slice(0, 10),
      amount: expected?.amount ?? 0,
      originalFilename: f.file.name,
      mimeType,
    });
    const s = await persistPlanningUpload({
      buffer: f.buffer,
      filename,
      mimeType,
      workspaceId: entitlements.workspaceId,
    });
    stored.push({ ...f, ...s, filename, mimeType });
  }

  const commitmentIds = [...new Set(nf.allocations.map((a) => a.commitmentId))];
  await prisma.$transaction(async (tx) => {
    for (const s of stored) {
      const doc = await tx.planningDocument.create({
        data: {
          kind: "TAX_PROOF",
          status: "IMPORTED",
          filename: s.filename,
          mimeType: s.mimeType,
          storagePath: s.storagePath,
          byteSize: s.byteSize,
          originalByteSize: s.originalByteSize,
          contentHash: s.contentHash,
          extractedJson: {
            taxDocType: s.type,
            taxKind,
            ...(s.type === "COMPROVANTE"
              ? { amount: proofRead.amount ?? null, paymentDate: proofRead.paymentDate ?? null }
              : {}),
          },
          grossAmount: expected?.amount ?? null,
          workspaceId: entitlements.workspaceId,
          planningProjectId,
          engagementId: nf.engagementId,
          commitmentId: nf.commitmentId ?? commitmentIds[0],
          sourceDocumentId: nf.id,
        },
      });
      for (const a of nf.allocations) {
        await tx.documentRubricAllocation.create({
          data: {
            documentId: doc.id,
            budgetLineId: a.budgetLineId,
            commitmentId: a.commitmentId,
            sharePct: a.sharePct,
            amount: a.amount,
            taxesJson: a.taxesJson ?? undefined,
          },
        });
      }
    }
    await tx.appNotification.deleteMany({
      where: {
        workspaceId: entitlements.workspaceId,
        type: { in: ["TAX_DUE_ISS", "TAX_DUE_FEDERAL"] },
        href: { in: commitmentIds.map((id) => `/planejamento/compromissos/${id}`) },
      },
    });
  });

  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.tax_documents",
    entityType: "PlanningDocument",
    entityId: nf.id,
    meta: {
      planningProjectId,
      taxKind,
      documents: stored.map((s) => s.type),
      proofAmount: proofRead.amount ?? null,
      expectedAmount: expected?.amount ?? null,
      pronacOverride: pronacGate.overrideReason,
    },
  });
  revalidatePlanning(planningProjectId);
  for (const id of commitmentIds) revalidatePath(`/planejamento/compromissos/${id}`);
  const base = `${TAX_KIND_LABELS[taxKind]} lançado no pagamento de ${supplier?.name ?? "fornecedor"} (${stored.length} documentos).`;
  return { ok: true, id: commitmentIds[0], message: warnings.length ? `${base} Atenção: ${warnings.join(" ")}` : base };
}
