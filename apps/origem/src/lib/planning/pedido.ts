"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { normalizeCgccpf, parseBrMoney } from "@/lib/format";
import { canExceedRubric } from "@/lib/planning/acl";
import { logPlanningAction } from "@/lib/activity-audit";
import {
  canReserveAmount,
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";
import { fifthBusinessDayNextMonth } from "@/lib/planning/business-days";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { normalizeCnaeCode } from "@/lib/catalog/cnae";
import { lookupCnpj } from "@/lib/catalog/brasil-api";
import { findOrCreateCatalogServiceForRubric } from "@/lib/catalog/service-from-rubric";
import type { ActionState } from "@/lib/planning/action-state";
import { scaleTaxes, taxTotalOf } from "@/lib/nf/extract";
import {
  extractPaymentDetails,
  mergePaymentDetails,
} from "@/lib/nf/payment-details";

function revalidatePedido(planningProjectId: string, pedidoId?: string) {
  revalidatePath("/planejamento");
  revalidatePath(`/planejamento/${planningProjectId}`);
  revalidatePath(`/planejamento/${planningProjectId}/reservas`);
  revalidatePath(`/planejamento/${planningProjectId}/pedidos`);
  revalidatePath("/planejamento/contas-a-pagar");
  if (pedidoId) {
    revalidatePath(`/planejamento/${planningProjectId}/pedidos/${pedidoId}`);
  }
}

function parseExpectedPayAt(raw: string, fallback: Date): Date {
  if (!raw.trim()) return fallback;
  return new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw,
  );
}

export type PedidoParcelInput = {
  budgetLineId: string;
  amount: number;
  expectedPayAt: string;
};

/** Cria um Pedido com N parcelas (compromissos RESERVED). */
export async function createPedido(
  planningProjectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();

  const supplierName = String(formData.get("supplierName") || "").trim();
  const cnpj = normalizeCgccpf(String(formData.get("cnpj") || ""));
  const description = String(formData.get("description") || "").trim() || null;
  const hasBond =
    formData.get("hasBond") === "on" || formData.get("hasBond") === "true";
  let cnaeCode = normalizeCnaeCode(String(formData.get("cnaeCode") || ""));
  let cnaeDescription =
    String(formData.get("cnaeDescription") || "").trim() || null;
  const totalAmount =
    parseBrMoney(String(formData.get("totalAmount") || "")) || 0;

  let parcels: PedidoParcelInput[] = [];
  try {
    parcels = JSON.parse(String(formData.get("parcelsJson") || "[]")) as PedidoParcelInput[];
  } catch {
    return { error: "Parcelas inválidas" };
  }
  parcels = parcels
    .map((p) => ({
      budgetLineId: String(p.budgetLineId || "").trim(),
      amount: Number(p.amount) || 0,
      expectedPayAt: String(p.expectedPayAt || "").trim(),
    }))
    .filter((p) => p.budgetLineId && p.amount > 0);

  if (!supplierName || !cnpj) {
    return { error: "Informe fornecedor e CPF/CNPJ" };
  }
  if (!(totalAmount > 0) || parcels.length === 0) {
    return { error: "Informe valor total e ao menos uma parcela" };
  }

  const parcelsSum =
    Math.round(parcels.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  if (Math.abs(parcelsSum - totalAmount) > 0.02) {
    return {
      error: `Soma das parcelas (R$ ${parcelsSum.toFixed(2)}) deve igualar o total (R$ ${totalAmount.toFixed(2)})`,
    };
  }

  const project = await prisma.planningProject.findFirst({
    where: { id: planningProjectId, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: true } },
      commitments: { where: { status: { in: ["RESERVED", "PAID"] } } },
      project: { select: { valorCaptado: true } },
    },
  });
  if (!project?.sheet) return { error: "Projeto sem planilha" };

  const valorCaptado =
    (project.project?.valorCaptado != null
      ? Number(project.project.valorCaptado)
      : null) ?? 0;
  const { loadPublishedPaidByLine } = await import(
    "@/lib/planning/federal/audit-reconcile"
  );
  const publishedPaidByLine = await loadPublishedPaidByLine(planningProjectId);
  const balance = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
    publishedPaidByLine,
  });

  const allowOverflow = await canExceedRubric();
  const byLine = new Map<string, number>();
  for (const p of parcels) {
    byLine.set(p.budgetLineId, (byLine.get(p.budgetLineId) || 0) + p.amount);
  }
  for (const [lineId, amount] of byLine) {
    const line = project.sheet.lines.find((l) => l.id === lineId);
    if (!line) return { error: "Rubrica da parcela não encontrada" };
    const check = canReserveAmount({
      lineId,
      amount,
      balance,
      allowOverflow: allowOverflow && !isAdminProduct(line.productName),
    });
    if (!check.ok) return { error: `${line.itemName}: ${check.message}` };
    const bal = balance.lines.get(lineId)!;
    bal.reserved += amount;
    bal.available -= amount;
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

  const hiredAt = new Date();
  let pedidoId: string;
  try {
    pedidoId = await prisma.$transaction(async (tx) => {
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
        publishedPaidByLine,
      });
      for (const [lineId, amount] of byLine) {
        const line = project.sheet!.lines.find((l) => l.id === lineId)!;
        const check = canReserveAmount({
          lineId,
          amount,
          balance: liveBalance,
          allowOverflow: allowOverflow && !isAdminProduct(line.productName),
        });
        if (!check.ok) throw new Error(`BALANCE:${line.itemName}: ${check.message}`);
        const bal = liveBalance.lines.get(lineId)!;
        bal.reserved += amount;
        bal.available -= amount;
      }

      const supplier = await tx.catalogSupplier.upsert({
        where: {
          workspaceId_cnpj: { workspaceId: entitlements.workspaceId, cnpj },
        },
        create: {
          workspaceId: entitlements.workspaceId,
          cnpj,
          name: supplierName,
          cnaeCode: isCnpj ? cnaeCode || null : null,
          cnaeDescription: isCnpj ? cnaeDescription : null,
        },
        update: {
          name: supplierName,
          ...(isCnpj && cnaeCode
            ? {
                cnaeCode,
                cnaeDescription: cnaeDescription || undefined,
              }
            : {}),
        },
      });

      const pedido = await tx.planningPedido.create({
        data: {
          workspaceId: entitlements.workspaceId,
          planningProjectId: project.id,
          supplierId: supplier.id,
          description,
          totalAmount,
          status: "OPEN",
          createdById: session.id,
        },
      });

      const prefs = await getNotificationPrefs(
        entitlements.workspaceId,
        session.id,
      );

      for (let i = 0; i < parcels.length; i++) {
        const parcel = parcels[i]!;
        const line = project.sheet!.lines.find((l) => l.id === parcel.budgetLineId)!;
        const service = await findOrCreateCatalogServiceForRubric(tx, {
          supplierId: supplier.id,
          rubricName: line.itemName,
          categoryHint: line.categoryHint,
        });
        const expectedPayAt = parseExpectedPayAt(
          parcel.expectedPayAt,
          fifthBusinessDayNextMonth(hiredAt),
        );

        const engagement = await tx.catalogEngagement.create({
          data: {
            workspaceId: entitlements.workspaceId,
            serviceId: service.id,
            price: parcel.amount,
            unitPrice: parcel.amount,
            quantity: 1,
            priceUnit: "closed",
            hiredAt,
            source: "PLANNING_PEDIDO",
            planningProjectId: project.id,
            budgetLineId: parcel.budgetLineId,
            notes:
              description ||
              `Pedido · parcela ${i + 1}/${parcels.length}`,
          },
        });

        const commitment = await tx.rubricCommitment.create({
          data: {
            budgetLineId: parcel.budgetLineId,
            planningProjectId: project.id,
            workspaceId: entitlements.workspaceId,
            engagementId: engagement.id,
            pedidoId: pedido.id,
            installmentNumber: i + 1,
            amount: parcel.amount,
            status: "RESERVED",
            hasBond,
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
              title: `Pedido — parcela ${i + 1} · ${project.externalCode}`,
              body: `R$ ${parcel.amount.toFixed(2)} · vencimento ${expectedPayAt.toLocaleDateString("pt-BR")}`,
              href: `/planejamento/contas-a-pagar?due=upcoming&c=${commitment.id}`,
              meta: {
                commitmentId: commitment.id,
                pedidoId: pedido.id,
                due: "upcoming",
                expectedPayAt: expectedPayAt.toISOString(),
              },
            },
          });
        }
      }

      return pedido.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("BALANCE:")) {
      return { error: msg.slice("BALANCE:".length) };
    }
    throw err;
  }

  revalidatePedido(project.id, pedidoId);
  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.pedido_created",
    entityType: "PlanningPedido",
    entityId: pedidoId,
    meta: { planningProjectId: project.id, parcels: parcels.length },
  });
  redirect(`/planejamento/${project.id}/pedidos/${pedidoId}`);
}

export async function cancelPedido(
  pedidoId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();

  const pedido = await prisma.planningPedido.findFirst({
    where: { id: pedidoId, workspaceId: entitlements.workspaceId },
    include: {
      commitments: { select: { id: true, status: true } },
    },
  });
  if (!pedido) return { error: "Pedido não encontrado" };
  if (pedido.status === "CANCELLED") return { error: "Pedido já cancelado" };
  if (pedido.commitments.some((c) => c.status === "PAID")) {
    return { error: "Não é possível cancelar: há parcela já paga" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.rubricCommitment.updateMany({
      where: {
        pedidoId: pedido.id,
        status: "RESERVED",
      },
      data: { status: "CANCELLED" },
    });
    await tx.planningPedido.update({
      where: { id: pedido.id },
      data: { status: "CANCELLED" },
    });
  });

  revalidatePedido(pedido.planningProjectId, pedido.id);
  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.pedido_cancelled",
    entityType: "PlanningPedido",
    entityId: pedido.id,
    meta: { planningProjectId: pedido.planningProjectId },
  });
  return { ok: true, message: "Pedido cancelado" };
}

/** Vincula NF/RPA já em REVIEW a um pedido OPEN (sem criar novas reservas). */
export async function attachNfToPedido(params: {
  session: { id: string };
  entitlements: { workspaceId: string };
  documentId: string;
  doc: {
    id: string;
    kind: string;
    planningProjectId: string | null;
    extractedJson: unknown;
  };
  formData: FormData;
  attachPedidoId: string;
  supplierName: string;
  cnpj: string;
  grossAmount: number;
  taxesFromForm: Record<string, number | null>;
  fiscalNumber: string;
  hasBond: boolean;
}): Promise<ActionState> {
  const {
    entitlements,
    documentId,
    doc,
    formData,
    attachPedidoId,
    supplierName,
    cnpj,
    grossAmount,
    taxesFromForm,
    fiscalNumber,
    hasBond,
  } = params;

  if (!cnpj || !supplierName || !(grossAmount > 0)) {
    return { error: "Preencha fornecedor e valor bruto" };
  }

  const pedido = await prisma.planningPedido.findFirst({
    where: {
      id: attachPedidoId,
      workspaceId: entitlements.workspaceId,
      status: "OPEN",
    },
    include: {
      commitments: {
        where: { status: "RESERVED" },
        orderBy: { installmentNumber: "asc" },
      },
      supplier: { select: { cnpj: true, name: true } },
      planningProject: { select: { id: true, externalCode: true } },
    },
  });
  if (!pedido) return { error: "Pedido não encontrado ou já vinculado" };
  if (pedido.planningProjectId !== doc.planningProjectId) {
    return { error: "NF não pertence ao mesmo projeto do pedido" };
  }
  if (pedido.sourceDocumentId) {
    return { error: "Pedido já possui NF vinculada" };
  }
  if (pedido.commitments.length === 0) {
    return { error: "Pedido sem parcelas reservadas" };
  }

  const reservedTotal =
    Math.round(
      pedido.commitments.reduce((s, c) => s + Number(c.amount), 0) * 100,
    ) / 100;
  if (Math.abs(reservedTotal - grossAmount) > 0.05) {
    return {
      error: `Valor da NF (R$ ${grossAmount.toFixed(2)}) deve coincidir com o pedido (R$ ${reservedTotal.toFixed(2)})`,
    };
  }

  const hiredAtRaw = String(formData.get("hiredAt") || "").trim();
  const hiredAt = hiredAtRaw
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(hiredAtRaw)
          ? `${hiredAtRaw}T12:00:00`
          : hiredAtRaw,
      )
    : new Date();

  const extracted = (doc.extractedJson || {}) as {
    serviceDescription?: string | null;
    payment?: {
      pixKey?: string | null;
      bankName?: string | null;
      bankAgency?: string | null;
      bankAccount?: string | null;
      paymentNotes?: string | null;
    } | null;
  };
  const paymentFromForm = {
    pixKey: String(formData.get("pixKey") || "").trim() || null,
    bankName: String(formData.get("bankName") || "").trim() || null,
    bankAgency: String(formData.get("bankAgency") || "").trim() || null,
    bankAccount: String(formData.get("bankAccount") || "").trim() || null,
    paymentNotes: String(formData.get("paymentNotes") || "").trim() || null,
  };
  const paymentIncoming = mergePaymentDetails(
    paymentFromForm,
    mergePaymentDetails(
      extracted.payment,
      extractPaymentDetails(extracted.serviceDescription || ""),
    ),
  );

  const taxTotal = taxTotalOf(taxesFromForm);
  const docKind = doc.kind === "RPA" ? "RPA" : "NF";
  const firstCommitmentId = pedido.commitments[0]!.id;

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.planningDocument.updateMany({
        where: {
          id: documentId,
          workspaceId: entitlements.workspaceId,
          status: "REVIEW",
        },
        data: {
          status: "IMPORTED",
          commitmentId: firstCommitmentId,
          personType: cnpj.length === 14 ? "PJ" : "PF",
          grossAmount,
          taxTotal: taxTotal || null,
          taxesJson: taxesFromForm,
          extractedJson: {
            ...((doc.extractedJson as object) || {}),
            fiscalNumber,
            nfNumber: fiscalNumber,
            invoiceNumber: fiscalNumber,
            fiscalNumberSource: "manual",
            supplierName,
            cnpj,
            payment: paymentIncoming,
            hiredAt: hiredAt.toISOString().slice(0, 10),
          },
        },
      });
      if (claimed.count !== 1) {
        throw new Error("DOCUMENT_ALREADY_RESERVED");
      }

      for (const c of pedido.commitments) {
        const sharePct =
          Math.round((Number(c.amount) / grossAmount) * 10000) / 100;
        await tx.rubricCommitment.update({
          where: { id: c.id },
          data: {
            hasBond,
            allocationSharePct: sharePct,
          },
        });
      }

      // DocumentRubricAllocation é único por document+budgetLine — agrupa parcelas na mesma rubrica.
      const lineGroups = new Map<
        string,
        Array<{ commitmentId: string; amount: number }>
      >();
      for (const c of pedido.commitments) {
        const list = lineGroups.get(c.budgetLineId) || [];
        list.push({ commitmentId: c.id, amount: Number(c.amount) });
        lineGroups.set(c.budgetLineId, list);
      }

      for (const [budgetLineId, items] of lineGroups) {
        const amount = items.reduce((s, i) => s + i.amount, 0);
        const sharePct = Math.round((amount / grossAmount) * 10000) / 100;
        await tx.documentRubricAllocation.create({
          data: {
            documentId,
            budgetLineId,
            commitmentId: items[0]!.commitmentId,
            sharePct,
            amount,
            taxesJson: scaleTaxes(taxesFromForm, sharePct) as object,
          },
        });
      }

      const existingSupplier = await tx.catalogSupplier.findUnique({
        where: {
          workspaceId_cnpj: { workspaceId: entitlements.workspaceId, cnpj },
        },
      });
      const mergedPayment = mergePaymentDetails(
        existingSupplier
          ? {
              pixKey: existingSupplier.pixKey,
              bankName: existingSupplier.bankName,
              bankAgency: existingSupplier.bankAgency,
              bankAccount: existingSupplier.bankAccount,
              paymentNotes: existingSupplier.paymentNotes,
            }
          : null,
        paymentIncoming,
      );
      await tx.catalogSupplier.upsert({
        where: {
          workspaceId_cnpj: { workspaceId: entitlements.workspaceId, cnpj },
        },
        create: {
          workspaceId: entitlements.workspaceId,
          cnpj,
          name: supplierName,
          pixKey: mergedPayment.pixKey,
          bankName: mergedPayment.bankName,
          bankAgency: mergedPayment.bankAgency,
          bankAccount: mergedPayment.bankAccount,
          paymentNotes: mergedPayment.paymentNotes,
        },
        update: {
          name: supplierName,
          pixKey: mergedPayment.pixKey || undefined,
          bankName: mergedPayment.bankName || undefined,
          bankAgency: mergedPayment.bankAgency || undefined,
          bankAccount: mergedPayment.bankAccount || undefined,
          paymentNotes: mergedPayment.paymentNotes || undefined,
        },
      });

      await tx.planningPedido.update({
        where: { id: pedido.id },
        data: {
          sourceDocumentId: documentId,
          status: "FULFILLED",
        },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "DOCUMENT_ALREADY_RESERVED") {
      return { error: "Este documento já foi reservado." };
    }
    // Unique constraint if duplicate lines mishandled
    throw err;
  }

  revalidatePedido(pedido.planningProjectId, pedido.id);
  redirect(`/planejamento/${pedido.planningProjectId}/pedidos/${pedido.id}`);
}
