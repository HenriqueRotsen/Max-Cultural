"use server";

import { randomUUID } from "node:crypto";
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
import { cnpjsInText } from "@/lib/planning/support-docs";
import { markGroupForRepublish } from "@/lib/planning/support-attach";
import { normalizeCgccpf } from "@/lib/format";
import {
  TAX_DOC_TYPES,
  TAX_KIND_LABELS,
  isTaxKind,
  retainedTaxes,
  taxGuideTotal,
  validateTaxGuideItems,
  type TaxDocType,
  type TaxGuideItem,
} from "@/lib/planning/tax-docs";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cents = (v: number) => Math.round(v * 100) / 100;

/** Impostos federais: a guia (DARF) vai para a Receita Federal. */
const FEDERAL_TAXES = new Set(["inss", "irrf", "pis", "cofins", "csll"]);
const RECEITA_FEDERAL = { cnpj: "00394460005887", name: "Receita Federal do Brasil" };

function parseItems(raw: string): TaxGuideItem[] | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return null;
    return v.map((it) => ({
      nfId: String((it as TaxGuideItem).nfId),
      rubricas: ((it as TaxGuideItem).rubricas ?? []).map((r) => ({
        allocationId: String(r.allocationId),
        amount: cents(Number(r.amount)),
      })),
    }));
  } catch {
    return null;
  }
}

/**
 * Imposto pago por uma guia: a guia e o comprovante são únicos e podem cobrir
 * vários pagamentos. Em cada pagamento, o valor do imposto vai para as
 * rubricas escolhidas; a nota fiscal do imposto (se houver) é de cada um.
 * Cada pagamento ganha os seus documentos (o mesmo arquivo da guia e do
 * comprovante), com o rateio só nas rubricas e valores informados.
 */
export async function uploadTaxDocuments(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const taxKind = String(formData.get("taxKind") || "");
  if (!isTaxKind(taxKind)) return { error: "Escolha qual imposto." };
  const guideNumber = String(formData.get("guideNumber") || "").trim() || null;
  let payeeCnpj = normalizeCgccpf(String(formData.get("payeeCnpj") || ""));
  let payeeName = String(formData.get("payeeName") || "").trim();
  const items = parseItems(String(formData.get("items") || "[]"));
  if (!items) return { error: "Não deu para ler os pagamentos da guia. Recarregue a página." };
  for (const it of items) it.rubricas = it.rubricas.filter((r) => r.amount !== 0);
  const invalid = validateTaxGuideItems(items);
  if (invalid) return { error: invalid };

  const guiaFile = formData.get("guiaFile");
  const proofFile = formData.get("proofFile");
  if (!(guiaFile instanceof File) || guiaFile.size === 0) return { error: "Anexe a guia do imposto." };
  if (!(proofFile instanceof File) || proofFile.size === 0) {
    return { error: "Anexe o comprovante de pagamento do imposto." };
  }

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    select: { externalCode: true, closedAt: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (project.closedAt) return { error: "O projeto está encerrado." };

  const nfs = await prisma.planningDocument.findMany({
    where: {
      id: { in: items.map((i) => i.nfId) },
      workspaceId: entitlements.workspaceId,
      planningProjectId,
      kind: { in: ["NF", "RPA"] },
      status: "IMPORTED",
    },
    include: {
      allocations: true,
      commitment: {
        select: { engagement: { select: { service: { select: { supplier: { select: { name: true, cnpj: true } } } } } } },
      },
    },
  });
  const nfById = new Map(nfs.map((n) => [n.id, n]));
  const warnings: string[] = [];
  for (const it of items) {
    const nf = nfById.get(it.nfId);
    if (!nf) return { error: "Um dos pagamentos não é deste projeto (ou a nota não foi confirmada)." };
    const ids = new Set(nf.allocations.map((a) => a.id));
    if (it.rubricas.some((r) => !ids.has(r.allocationId))) {
      return { error: "Uma rubrica escolhida não é deste pagamento. Recarregue a página." };
    }
    const supplier = nf.commitment?.engagement.service.supplier.name ?? "fornecedor";
    const expected = retainedTaxes(nf.taxesJson).find((t) => t.kind === taxKind);
    const sum = cents(it.rubricas.reduce((s, r) => s + r.amount, 0));
    if (!expected) {
      warnings.push(`A nota de ${supplier} não mostra ${TAX_KIND_LABELS[taxKind]} retido.`);
    } else if (Math.abs(sum - expected.amount) > 0.02) {
      warnings.push(`${supplier}: lançado ${brl(sum)}, a nota retém ${brl(expected.amount)}.`);
    }
  }
  const total = taxGuideTotal(items);

  // Comprovante: trava do PRONAC e conferência do valor com o total (só aviso).
  const guiaBuffer = Buffer.from(await guiaFile.arrayBuffer());
  const proofBuffer = Buffer.from(await proofFile.arrayBuffer());
  const proofRead = await extractProofFromBuffer({
    buffer: proofBuffer,
    filename: proofFile.name,
    mimeType: proofFile.type || "application/octet-stream",
  });
  // Quem recebe o imposto (fornecedor do lançamento da guia no SALIC): o que a
  // pessoa informou; senão, o CNPJ que aparece na guia; nos federais, a Receita.
  if (!payeeCnpj) {
    const known = new Set(
      nfs.map((n) => normalizeCgccpf(n.commitment?.engagement.service.supplier.cnpj ?? "")).filter(Boolean),
    );
    const guiaRead = await extractProofFromBuffer({
      buffer: guiaBuffer,
      filename: guiaFile.name,
      mimeType: guiaFile.type || "application/octet-stream",
    });
    payeeCnpj = cnpjsInText(guiaRead.rawText || "").find((c) => !known.has(c)) ?? "";
  }
  if (!payeeCnpj && FEDERAL_TAXES.has(taxKind)) {
    payeeCnpj = RECEITA_FEDERAL.cnpj;
    payeeName ||= RECEITA_FEDERAL.name;
  }
  if (payeeCnpj.length !== 14 && payeeCnpj.length !== 11) {
    return { error: "Informe o CNPJ de quem recebe o imposto (a prefeitura, no ISS)." };
  }
  if (!payeeName) payeeName = payeeCnpj === RECEITA_FEDERAL.cnpj ? RECEITA_FEDERAL.name : "Órgão arrecadador";

  const projectCheck = checkProjectCodeInDocument({
    text: proofRead.rawText,
    expectedCode: project.externalCode,
    extractedPronac: proofRead.pronac,
  });
  const pronacGate = await enforcePronacMatch({ mismatch: projectCheck.warning, formData });
  if (!pronacGate.ok) return { error: pronacGate.error, pronacOverride: pronacGate.pronacOverride };
  if (proofRead.amount && Math.abs(proofRead.amount - total) > 0.02) {
    warnings.push(`O comprovante mostra ${brl(proofRead.amount)} e os pagamentos somam ${brl(total)}.`);
  }

  // A mesma guia não entra duas vezes no mesmo pagamento.
  const guiaHash = hashDocumentContent(guiaBuffer);
  const dup = await prisma.planningDocument.findFirst({
    where: {
      workspaceId: entitlements.workspaceId,
      kind: "TAX_PROOF",
      sourceDocumentId: { in: items.map((i) => i.nfId) },
      contentHash: guiaHash,
    },
    select: { sourceDocumentId: true },
  });
  if (dup) {
    const n = nfById.get(dup.sourceDocumentId ?? "");
    const name = n?.commitment?.engagement.service.supplier.name ?? "um dos pagamentos";
    return { error: `Esta guia já está lançada no pagamento de ${name}.` };
  }

  // Arquivos únicos (guia e comprovante) e a nota do imposto de cada pagamento.
  async function store(type: TaxDocType, file: File, buffer: Buffer, supplierName: string, supplierDoc: string, amount: number) {
    const mimeType = file.type || "application/octet-stream";
    const filename = buildPlanningDocumentFilename({
      kind: "TAX_PROOF",
      projectCode: project!.externalCode,
      supplierName,
      supplierDoc,
      hiredAt: new Date().toISOString().slice(0, 10),
      amount,
      originalFilename: file.name,
      mimeType,
    });
    const s = await persistPlanningUpload({ buffer, filename, mimeType, workspaceId: entitlements.workspaceId });
    return { type, filename, mimeType, ...s };
  }
  const label = TAX_KIND_LABELS[taxKind];
  const guia = await store("GUIA", guiaFile, guiaBuffer, `guia-${label}`, "", total);
  const proof = await store("COMPROVANTE", proofFile, proofBuffer, `guia-${label}`, "", total);
  const perNf = new Map<string, Awaited<ReturnType<typeof store>>>();
  for (const it of items) {
    const f = formData.get(`taxNfFile_${it.nfId}`);
    if (!(f instanceof File) || f.size === 0) continue;
    const nf = nfById.get(it.nfId)!;
    const supplier = nf.commitment?.engagement.service.supplier;
    const amount = cents(it.rubricas.reduce((s, r) => s + r.amount, 0));
    perNf.set(
      it.nfId,
      await store("NF_IMPOSTO", f, Buffer.from(await f.arrayBuffer()), supplier?.name ?? label, supplier?.cnpj ?? "", amount),
    );
  }

  const taxGroupId = randomUUID();
  const commitmentIds = new Set<string>();
  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      const nf = nfById.get(it.nfId)!;
      const paymentTax = cents(it.rubricas.reduce((s, r) => s + r.amount, 0));
      // Cada rubrica é um lançamento próprio no SALIC: guia, nota do imposto
      // (se houver) e comprovante, no valor do imposto daquela rubrica.
      for (const r of it.rubricas.filter((x) => x.amount > 0)) {
        const a = nf.allocations.find((x) => x.id === r.allocationId)!;
        commitmentIds.add(a.commitmentId);
        const taxSlot = randomUUID();
        const files = [guia, proof, ...(perNf.has(it.nfId) ? [perNf.get(it.nfId)!] : [])];
        for (const s of files) {
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
                taxGroupId,
                taxSlot,
                guideTotal: total,
                guidePayments: items.length,
                paymentTax,
                amount: r.amount,
                payeeCnpj,
                payeeName,
                guideNumber,
                paymentDate: proofRead.paymentDate ?? null,
                paymentDocumentNumber: proofRead.paymentDocumentNumber ?? null,
                ...(s.type === "COMPROVANTE" ? { proofAmount: proofRead.amount ?? null } : {}),
              },
              grossAmount: r.amount,
              workspaceId: entitlements.workspaceId,
              planningProjectId,
              engagementId: nf.engagementId,
              commitmentId: a.commitmentId,
              sourceDocumentId: nf.id,
            },
          });
          await tx.documentRubricAllocation.create({
            data: {
              documentId: doc.id,
              budgetLineId: a.budgetLineId,
              commitmentId: a.commitmentId,
              sharePct: 100,
              amount: r.amount,
              taxesJson: { [taxKind]: r.amount },
            },
          });
        }
      }
    }
    await tx.appNotification.deleteMany({
      where: {
        workspaceId: entitlements.workspaceId,
        type: { in: ["TAX_DUE_ISS", "TAX_DUE_FEDERAL"] },
        href: { in: [...commitmentIds].map((id) => `/planejamento/compromissos/${id}`) },
      },
    });
  });
  // A NF passa a ir ao SALIC pelo líquido: se já estava lá, fica para atualizar.
  const republish = await markGroupForRepublish([...commitmentIds]);

  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.tax_documents",
    entityType: "PlanningDocument",
    entityId: items[0]!.nfId,
    meta: {
      planningProjectId,
      taxKind,
      taxGroupId,
      total,
      payments: items.map((it) => ({
        nfId: it.nfId,
        rubricas: it.rubricas.filter((r) => r.amount > 0),
        taxNf: perNf.has(it.nfId),
      })),
      proofAmount: proofRead.amount ?? null,
      payeeCnpj,
      republish,
      pronacOverride: pronacGate.overrideReason,
    },
  });
  revalidatePlanning(planningProjectId);
  for (const id of commitmentIds) revalidatePath(`/planejamento/compromissos/${id}`);
  const base = `${label} de ${brl(total)} lançado em ${items.length} ${items.length === 1 ? "pagamento" : "pagamentos"} (${TAX_DOC_TYPES.GUIA.toLowerCase()} e comprovante${perNf.size ? `, ${perNf.size} nota(s) do imposto` : ""}).`;
  const salicNote =
    republish > 0
      ? " Os pagamentos que já estavam no SALIC ficaram para atualizar (a NF passa a ir pelo líquido)."
      : "";
  return {
    ok: true,
    id: [...commitmentIds][0],
    message: warnings.length ? `${base}${salicNote} Atenção: ${warnings.join(" ")}` : `${base}${salicNote}`,
  };
}
