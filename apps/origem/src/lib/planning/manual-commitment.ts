"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { normalizeCgccpf, parseBrMoney } from "@/lib/format";
import { canExceedRubric } from "@/lib/planning/acl";
import {
  canReserveAmount,
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";
import { fifthBusinessDayNextMonth } from "@/lib/planning/business-days";
import { parseReminderDate } from "@/lib/planning/reminder-dates";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { sendNotificationEmail } from "@/lib/planning/notify-email";
import { buildPlanningDocumentFilename } from "@/lib/nf/document-filename";
import { persistPlanningUpload } from "@/lib/nf/persist-upload";
import { extractProofFromBuffer } from "@/lib/nf/extract";
import {
  checkPaymentAmount,
  checkProjectCodeInDocument,
} from "@/lib/nf/document-cross-check";
import { normalizeCnaeCode } from "@/lib/catalog/cnae";
import { lookupCnpj } from "@/lib/catalog/brasil-api";
import type { ActionState } from "@/lib/planning/action-state";
import {
  parseProducerSheet,
  type ProducerSheetRow,
} from "@/lib/planning/producer-sheet";
import type { RubricCandidate } from "@/lib/planning/recommend-rubric";

function revalidatePlanning(id?: string) {
  revalidatePath("/planejamento");
  revalidatePath("/planejamento/buscar");
  revalidatePath("/fornecedores");
  revalidatePath("/fornecedores/contratacoes");
  if (id) {
    revalidatePath(`/planejamento/${id}`);
    revalidatePath(`/planejamento/${id}/reservas`);
    revalidatePath(`/planejamento/${id}/nf/nova`);
    revalidatePath(`/planejamento/${id}/importar-produtor`);
  }
}

async function loadProjectForReservation(planningProjectId: string) {
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: true } },
      commitments: { where: { status: { in: ["RESERVED", "PAID"] } } },
      project: { select: { valorCaptado: true } },
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" as const };
  const valorCaptado =
    (project.project?.valorCaptado != null
      ? Number(project.project.valorCaptado)
      : null) ?? 0;
  const balance = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
  });
  return { entitlements, project, balance, valorCaptado };
}

type SupplierInput = {
  supplierName: string;
  cnpj: string;
  serviceName: string;
  cnaeCode?: string;
  cnaeDescription?: string | null;
};

async function upsertSupplierAndService(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: {
    workspaceId: string;
    supplier: SupplierInput;
    categoryHint?: string | null;
  },
) {
  const { supplierName, cnpj, serviceName, cnaeCode, cnaeDescription } =
    params.supplier;
  const isCnpj = cnpj.length === 14;

  const existingSupplier = await tx.catalogSupplier.findUnique({
    where: {
      workspaceId_cnpj: { workspaceId: params.workspaceId, cnpj },
    },
  });

  const supplier = await tx.catalogSupplier.upsert({
    where: {
      workspaceId_cnpj: { workspaceId: params.workspaceId, cnpj },
    },
    create: {
      workspaceId: params.workspaceId,
      cnpj,
      name: supplierName,
      cnaeCode: isCnpj ? cnaeCode || null : null,
      cnaeDescription: isCnpj ? cnaeDescription || null : null,
    },
    update: {
      name: supplierName,
      ...(isCnpj && cnaeCode
        ? {
            cnaeCode: existingSupplier?.cnaeCode || cnaeCode,
            cnaeDescription:
              existingSupplier?.cnaeDescription || cnaeDescription,
          }
        : {}),
    },
  });

  let service = await tx.catalogService.findFirst({
    where: {
      supplierId: supplier.id,
      name: { equals: serviceName, mode: "insensitive" },
    },
  });
  if (!service) {
    service = await tx.catalogService.create({
      data: {
        supplierId: supplier.id,
        name: serviceName,
        category: params.categoryHint || "outros",
      },
    });
  }
  return { supplier, service };
}

function parseExpectedPayAt(raw: string, fallback: Date): Date {
  if (!raw.trim()) return fallback;
  return new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw,
  );
}

/** Reserva manual de orçamento sem NF/RPA. */
export async function createManualReservation(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const loaded = await loadProjectForReservation(planningProjectId);
  if ("error" in loaded) return { error: loaded.error };
  const { entitlements, project, balance, valorCaptado } = loaded;

  const budgetLineId = String(formData.get("budgetLineId") || "").trim();
  const amount =
    parseBrMoney(String(formData.get("amount") || "")) || 0;
  const supplierName = String(formData.get("supplierName") || "").trim();
  const cnpj = normalizeCgccpf(String(formData.get("cnpj") || ""));
  const serviceName =
    String(formData.get("serviceName") || "").trim() || supplierName;
  const notes = String(formData.get("notes") || "").trim() || null;
  const hasBond =
    formData.get("hasBond") === "on" || formData.get("hasBond") === "true";
  const expectedPayAtRaw = String(formData.get("expectedPayAt") || "");
  let cnaeCode = normalizeCnaeCode(String(formData.get("cnaeCode") || ""));
  let cnaeDescription =
    String(formData.get("cnaeDescription") || "").trim() || null;

  if (!budgetLineId || !(amount > 0)) {
    return { error: "Informe rubrica e valor" };
  }
  if (!supplierName || !cnpj) {
    return { error: "Informe fornecedor e CPF/CNPJ" };
  }

  const line = project.sheet!.lines.find((l) => l.id === budgetLineId);
  if (!line) return { error: "Rubrica não encontrada" };

  const allowOverflow = await canExceedRubric();
  const check = canReserveAmount({
    lineId: budgetLineId,
    amount,
    balance,
    allowOverflow: allowOverflow && !isAdminProduct(line.productName),
  });
  if (!check.ok) return { error: check.message };

  const isCnpj = cnpj.length === 14;
  if (isCnpj && !cnaeCode) {
    const lookup = await lookupCnpj(cnpj);
    if (lookup?.cnaeCode) {
      cnaeCode = lookup.cnaeCode;
      cnaeDescription = cnaeDescription || lookup.cnaeDescription;
    }
  }
  if (isCnpj && !cnaeCode) {
    return { error: "Informe o CNAE do fornecedor (obrigatório para CNPJ)." };
  }

  const hiredAt = new Date();
  const expectedPayAt = parseExpectedPayAt(
    expectedPayAtRaw,
    fifthBusinessDayNextMonth(hiredAt),
  );

  let commitmentId: string;
  try {
    commitmentId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM planning_projects WHERE id = ${project.id} FOR UPDATE`;

      const freshCommitments = await tx.rubricCommitment.findMany({
        where: {
          planningProjectId: project.id,
          status: { in: ["RESERVED", "PAID"] },
        },
      });
      const liveBalance = computeProjectBalance({
        lines: project.sheet!.lines,
        commitments: freshCommitments,
        valorCaptado,
        captadoRecebido: project.captadoRecebido,
        captadoTransferido: project.captadoTransferido,
        rendimentos: project.rendimentos,
      });
      const liveCheck = canReserveAmount({
        lineId: budgetLineId,
        amount,
        balance: liveBalance,
        allowOverflow: allowOverflow && !isAdminProduct(line.productName),
      });
      if (!liveCheck.ok) throw new Error(`BALANCE:${liveCheck.message}`);

      const { service } = await upsertSupplierAndService(tx, {
        workspaceId: entitlements.workspaceId,
        supplier: {
          supplierName,
          cnpj,
          serviceName,
          cnaeCode: cnaeCode ?? undefined,
          cnaeDescription: cnaeDescription ?? undefined,
        },
        categoryHint: line.categoryHint ?? undefined,
      });

      const engagement = await tx.catalogEngagement.create({
        data: {
          workspaceId: entitlements.workspaceId,
          serviceId: service.id,
          price: amount,
          unitPrice: amount,
          quantity: 1,
          priceUnit: "closed",
          hiredAt,
          source: "PLANNING_MANUAL",
          planningProjectId: project.id,
          budgetLineId,
          notes: notes || "Reserva manual (sem NF)",
        },
      });

      const commitment = await tx.rubricCommitment.create({
        data: {
          budgetLineId,
          planningProjectId: project.id,
          workspaceId: entitlements.workspaceId,
          engagementId: engagement.id,
          amount,
          status: "RESERVED",
          hasBond,
          expectedPayAt,
          createdById: session.id,
        },
      });

      const prefs = await getNotificationPrefs(
        entitlements.workspaceId,
        session.id,
      );
      if (prefs.paymentDueSoon) {
        await tx.appNotification.create({
          data: {
            workspaceId: entitlements.workspaceId,
            userId: session.id,
            type: "PAYMENT_DUE_SOON",
            title: `Pagamento previsto — ${project.externalCode}`,
            body: `Reserva manual de R$ ${amount.toFixed(2)} · vencimento ${expectedPayAt.toLocaleDateString("pt-BR")}`,
            href: `/planejamento/compromissos/${commitment.id}`,
            meta: {
              commitmentId: commitment.id,
              expectedPayAt: expectedPayAt.toISOString(),
            },
          },
        });
      }

      return commitment.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("BALANCE:")) {
      return { error: msg.slice("BALANCE:".length) };
    }
    throw err;
  }

  revalidatePlanning(project.id);
  redirect(`/planejamento/compromissos/${commitmentId}`);
}

/** Pagamento antecipado: PAID + aguardando NF. */
export async function uploadAdvancePayment(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const loaded = await loadProjectForReservation(planningProjectId);
  if ("error" in loaded) return { error: loaded.error };
  const { entitlements, project, balance, valorCaptado } = loaded;

  const grossAmount =
    parseBrMoney(String(formData.get("amount") || "")) || 0;
  const supplierName = String(formData.get("supplierName") || "").trim();
  const cnpj = normalizeCgccpf(String(formData.get("cnpj") || ""));
  const serviceName =
    String(formData.get("serviceName") || "").trim() || supplierName;
  const notes = String(formData.get("notes") || "").trim() || null;
  const hasBond =
    formData.get("hasBond") === "on" || formData.get("hasBond") === "true";
  let cnaeCode = normalizeCnaeCode(String(formData.get("cnaeCode") || ""));
  let cnaeDescription =
    String(formData.get("cnaeDescription") || "").trim() || null;
  const file = formData.get("proofFile");
  const nfReminderRaw = String(formData.get("nfReminderAt") || "");

  const sharesRaw = String(formData.get("allocationsJson") || "[]");
  let allocations: Array<{ budgetLineId: string; sharePct: number }> = [];
  try {
    allocations = JSON.parse(sharesRaw) as Array<{
      budgetLineId: string;
      sharePct: number;
    }>;
  } catch {
    return { error: "Rateio inválido" };
  }
  allocations = allocations
    .map((a) => ({
      budgetLineId: String(a.budgetLineId || ""),
      sharePct: Math.round(Number(a.sharePct) * 10000) / 10000,
    }))
    .filter((a) => a.budgetLineId && a.sharePct > 0);

  if (!(grossAmount > 0)) {
    return { error: "Informe o valor total do pagamento" };
  }
  if (!supplierName || !cnpj) {
    return { error: "Informe fornecedor e CPF/CNPJ" };
  }
  if (allocations.length === 0) {
    return { error: "Informe ao menos uma rubrica no rateio" };
  }
  const uniqueLines = new Set(allocations.map((a) => a.budgetLineId));
  if (uniqueLines.size !== allocations.length) {
    return { error: "Não é permitido ratear duas vezes na mesma rubrica" };
  }
  const shareSum = allocations.reduce((s, a) => s + a.sharePct, 0);
  if (Math.abs(shareSum - 100) > 0.05) {
    return {
      error: `A soma dos percentuais deve ser 100% (atual: ${shareSum.toFixed(2)}%)`,
    };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o comprovante de pagamento" };
  }

  const allowOverflow = await canExceedRubric();
  const slices: Array<{
    budgetLineId: string;
    sharePct: number;
    amount: number;
  }> = [];

  for (const alloc of allocations) {
    const line = project.sheet!.lines.find((l) => l.id === alloc.budgetLineId);
    if (!line) return { error: "Rubrica do rateio não encontrada" };
    const amount = Math.round(grossAmount * (alloc.sharePct / 100) * 100) / 100;
    const check = canReserveAmount({
      lineId: alloc.budgetLineId,
      amount,
      balance,
      allowOverflow: allowOverflow && !isAdminProduct(line.productName),
    });
    if (!check.ok) {
      return { error: `${line.itemName}: ${check.message}` };
    }
    const bal = balance.lines.get(alloc.budgetLineId)!;
    bal.reserved += amount;
    bal.available -= amount;
    balance.totalReserved += amount;
    balance.totalAvailable -= amount;
    slices.push({
      budgetLineId: alloc.budgetLineId,
      sharePct: alloc.sharePct,
      amount,
    });
  }

  const isCnpj = cnpj.length === 14;
  if (isCnpj && !cnaeCode) {
    const lookup = await lookupCnpj(cnpj);
    if (lookup?.cnaeCode) {
      cnaeCode = lookup.cnaeCode;
      cnaeDescription = cnaeDescription || lookup.cnaeDescription;
    }
  }
  if (isCnpj && !cnaeCode) {
    return { error: "Informe o CNAE do fornecedor (obrigatório para CNPJ)." };
  }

  const paidAt = new Date();
  const expectedPayAt = fifthBusinessDayNextMonth(paidAt);
  const defaultNfReminder = new Date(paidAt);
  defaultNfReminder.setUTCDate(defaultNfReminder.getUTCDate() + 7);
  const nfReminderAt = parseReminderDate(nfReminderRaw, defaultNfReminder);

  const proofDisplayName = buildPlanningDocumentFilename({
    kind: "PAYMENT_PROOF",
    projectCode: project.externalCode,
    supplierName,
    supplierDoc: cnpj,
    hiredAt: paidAt.toISOString().slice(0, 10),
    amount: grossAmount,
    originalFilename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const proofExtracted = await extractProofFromBuffer({
    buffer,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
  });

  const amountCheck = checkPaymentAmount({
    extractedAmount: proofExtracted.amount,
    expectedAmount: grossAmount,
  });
  if (amountCheck.error) return { error: amountCheck.error };

  const projectCheck = checkProjectCodeInDocument({
    text: proofExtracted.rawText,
    expectedCode: project.externalCode,
    extractedPronac: proofExtracted.pronac,
  });
  const proofNotes = [
    notes,
    projectCheck.warning,
    amountCheck.warning,
  ]
    .filter(Boolean)
    .join(" · ");

  let stored;
  try {
    stored = await persistPlanningUpload({
      buffer,
      filename: proofDisplayName,
      mimeType: file.type || "application/octet-stream",
      workspaceId: entitlements.workspaceId,
      rejectDuplicate: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("DUPLICATE:")) {
      return { error: msg.slice("DUPLICATE:".length) };
    }
    throw e;
  }

  let commitmentId: string;
  try {
    commitmentId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM planning_projects WHERE id = ${project.id} FOR UPDATE`;

      const freshCommitments = await tx.rubricCommitment.findMany({
        where: {
          planningProjectId: project.id,
          status: { in: ["RESERVED", "PAID"] },
        },
      });
      const liveBalance = computeProjectBalance({
        lines: project.sheet!.lines,
        commitments: freshCommitments,
        valorCaptado,
        captadoRecebido: project.captadoRecebido,
        captadoTransferido: project.captadoTransferido,
        rendimentos: project.rendimentos,
      });
      for (const slice of slices) {
        const line = project.sheet!.lines.find((l) => l.id === slice.budgetLineId);
        if (!line) throw new Error("BALANCE:Rubrica do rateio não encontrada");
        const check = canReserveAmount({
          lineId: slice.budgetLineId,
          amount: slice.amount,
          balance: liveBalance,
          allowOverflow: allowOverflow && !isAdminProduct(line.productName),
        });
        if (!check.ok) {
          throw new Error(`BALANCE:${line.itemName}: ${check.message}`);
        }
        const bal = liveBalance.lines.get(slice.budgetLineId)!;
        bal.reserved += slice.amount;
        bal.available -= slice.amount;
        liveBalance.totalReserved += slice.amount;
        liveBalance.totalAvailable -= slice.amount;
      }

      const { service } = await upsertSupplierAndService(tx, {
        workspaceId: entitlements.workspaceId,
        supplier: {
          supplierName,
          cnpj,
          serviceName,
          cnaeCode: cnaeCode ?? undefined,
          cnaeDescription: cnaeDescription ?? undefined,
        },
        categoryHint:
          project.sheet!.lines.find((l) => l.id === slices[0]!.budgetLineId)
            ?.categoryHint ?? undefined,
      });

      let primaryCommitmentId: string | null = null;
      let primaryEngagementId: string | null = null;
      const commitmentByLine = new Map<string, string>();

      for (const slice of slices) {
        const engagement = await tx.catalogEngagement.create({
          data: {
            workspaceId: entitlements.workspaceId,
            serviceId: service.id,
            price: slice.amount,
            unitPrice: slice.amount,
            quantity: 1,
            priceUnit: "closed",
            hiredAt: paidAt,
            source: "PLANNING_MANUAL",
            planningProjectId: project.id,
            budgetLineId: slice.budgetLineId,
            notes:
              proofNotes ||
              `Pagamento antecipado (aguardando NF) · ${slice.sharePct}%`,
          },
        });

        const commitment = await tx.rubricCommitment.create({
          data: {
            budgetLineId: slice.budgetLineId,
            planningProjectId: project.id,
            workspaceId: entitlements.workspaceId,
            engagementId: engagement.id,
            amount: slice.amount,
            allocationSharePct: slice.sharePct,
            status: "PAID",
            nfPending: true,
            paidWithoutNf: true,
            hasBond,
            expectedPayAt,
            nfReminderAt,
            paidAt,
            createdById: session.id,
          },
        });

        commitmentByLine.set(slice.budgetLineId, commitment.id);
        if (!primaryCommitmentId) {
          primaryCommitmentId = commitment.id;
          primaryEngagementId = engagement.id;
        }
      }

      const proof = await tx.planningDocument.create({
        data: {
          kind: "PAYMENT_PROOF",
          status: "IMPORTED",
          filename: proofDisplayName,
          mimeType: file.type || "application/octet-stream",
          storagePath: stored.storagePath,
          byteSize: stored.byteSize,
          originalByteSize: stored.originalByteSize,
          contentHash: stored.contentHash,
          workspaceId: entitlements.workspaceId,
          planningProjectId: project.id,
          engagementId: primaryEngagementId,
          commitmentId: primaryCommitmentId,
        },
      });

      for (const slice of slices) {
        const cid = commitmentByLine.get(slice.budgetLineId);
        if (!cid) throw new Error("BALANCE:Compromisso do rateio não encontrado");
        await tx.documentRubricAllocation.create({
          data: {
            documentId: proof.id,
            budgetLineId: slice.budgetLineId,
            commitmentId: cid,
            sharePct: slice.sharePct,
            amount: slice.amount,
          },
        });
      }

      return primaryCommitmentId!;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("BALANCE:")) {
      return { error: msg.slice("BALANCE:".length) };
    }
    throw err;
  }

  revalidatePlanning(project.id);
  redirect(`/planejamento/compromissos/${commitmentId}`);
}

/** Cria reservas em lote a partir da planilha do produtor. */
export async function confirmProducerReservations(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const loaded = await loadProjectForReservation(planningProjectId);
  if ("error" in loaded) return { error: loaded.error };
  const { entitlements, project, balance, valorCaptado } = loaded;

  const rowsRaw = String(formData.get("rowsJson") || "[]");
  let rows: Array<{
    budgetLineId: string;
    amount: number;
    supplier: string;
    cnpj: string;
    item: string;
    notes: string;
    include: boolean;
  }> = [];
  try {
    rows = JSON.parse(rowsRaw);
  } catch {
    return { error: "Dados inválidos" };
  }

  const selected = rows.filter(
    (r) => r.include && r.budgetLineId && r.amount > 0 && r.supplier,
  );
  if (selected.length === 0) {
    return { error: "Selecione ao menos uma linha válida" };
  }

  const allowOverflow = await canExceedRubric();
  const simBalance = computeProjectBalance({
    lines: project.sheet!.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
  });
  for (const r of selected) {
    const line = project.sheet!.lines.find((l) => l.id === r.budgetLineId);
    if (!line) return { error: `Rubrica não encontrada: ${r.item}` };
    const cnpj = normalizeCgccpf(r.cnpj || "");
    if (!cnpj) return { error: `CPF/CNPJ ausente: ${r.supplier}` };
    const check = canReserveAmount({
      lineId: r.budgetLineId,
      amount: r.amount,
      balance: simBalance,
      allowOverflow: allowOverflow && !isAdminProduct(line.productName),
    });
    if (!check.ok) {
      return { error: `${line.itemName}: ${check.message}` };
    }
    const bal = simBalance.lines.get(r.budgetLineId)!;
    bal.reserved += r.amount;
    bal.available -= r.amount;
    simBalance.totalReserved += r.amount;
    simBalance.totalAvailable -= r.amount;
  }

  const hiredAt = new Date();
  const expectedPayAt = fifthBusinessDayNextMonth(hiredAt);
  const prefs = await getNotificationPrefs(
    entitlements.workspaceId,
    session.id,
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM planning_projects WHERE id = ${project.id} FOR UPDATE`;

      for (const r of selected) {
        const line = project.sheet!.lines.find((l) => l.id === r.budgetLineId)!;
        const cnpj = normalizeCgccpf(r.cnpj);
        const serviceName = r.item || r.supplier;

        const { service } = await upsertSupplierAndService(tx, {
          workspaceId: entitlements.workspaceId,
          supplier: {
            supplierName: r.supplier,
            cnpj,
            serviceName,
          },
          categoryHint: line.categoryHint ?? undefined,
        });

        const engagement = await tx.catalogEngagement.create({
          data: {
            workspaceId: entitlements.workspaceId,
            serviceId: service.id,
            price: r.amount,
            unitPrice: r.amount,
            quantity: 1,
            priceUnit: "closed",
            hiredAt,
            source: "PLANNING_MANUAL",
            planningProjectId: project.id,
            budgetLineId: r.budgetLineId,
            notes: r.notes || "Importação planilha produtor",
          },
        });

        const commitment = await tx.rubricCommitment.create({
          data: {
            budgetLineId: r.budgetLineId,
            planningProjectId: project.id,
            workspaceId: entitlements.workspaceId,
            engagementId: engagement.id,
            amount: r.amount,
            status: "RESERVED",
            expectedPayAt,
            createdById: session.id,
          },
        });

        if (prefs.paymentDueSoon) {
          await tx.appNotification.create({
            data: {
              workspaceId: entitlements.workspaceId,
              userId: session.id,
              type: "PAYMENT_DUE_SOON",
              title: `Pagamento previsto — ${project.externalCode}`,
              body: `Reserva de R$ ${r.amount.toFixed(2)} · ${r.supplier}`,
              href: `/planejamento/compromissos/${commitment.id}`,
              meta: {
                commitmentId: commitment.id,
                expectedPayAt: expectedPayAt.toISOString(),
              },
            },
          });
        }
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("BALANCE:")) {
      return { error: msg.slice("BALANCE:".length) };
    }
    throw err;
  }

  revalidatePlanning(project.id);
  redirect(`/planejamento/${project.id}/reservas`);
}

export async function parseProducerSheetAction(
  planningProjectId: string,
  _prev: ActionState & { rows?: ProducerSheetRow[] },
  formData: FormData,
): Promise<ActionState & { rows?: ProducerSheetRow[] }> {
  await requireUser();
  const loaded = await loadProjectForReservation(planningProjectId);
  if ("error" in loaded) return { error: loaded.error };
  const { entitlements, project, balance, valorCaptado } = loaded;

  const file = formData.get("sheetFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione a planilha" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const candidates: RubricCandidate[] = project.sheet!.lines.map((l) => {
    const bal = balance.lines.get(l.id);
    return {
      id: l.id,
      itemName: l.itemName,
      stageName: l.stageName,
      productName: l.productName,
      city: l.city,
      state: l.state,
      categoryHint: l.categoryHint,
      available: bal?.available ?? 0,
      isAdmin: isAdminProduct(l.productName),
    };
  });

  try {
    const rows = parseProducerSheet(buffer, file.name, candidates);
    return { ok: true, rows };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao ler planilha",
    };
  }
}
