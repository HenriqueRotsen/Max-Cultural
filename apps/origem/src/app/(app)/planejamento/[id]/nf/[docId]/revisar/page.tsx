import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { DeleteNfButton } from "@/components/planning/DeleteNfButton";
import { NfReviewForm } from "@/components/planning/NfReviewForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { canDeleteNf } from "@/lib/planning/acl";
import { computeProjectBalance, isAdminProduct } from "@/lib/planning/rubric-balance";
import { rubricSelectLabel } from "@/lib/planning/rubric-label";
import { recommendRubric } from "@/lib/planning/recommend-rubric";
import { lookupCnpj } from "@/lib/catalog/brasil-api";
import { normalizeCgccpf } from "@/lib/format";
import type { ExtractedFiscalDoc } from "@/lib/nf/extract";
import { extractPaymentDetails } from "@/lib/nf/payment-details";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import {
  defaultExpectedPayFromHiredAt,
  defaultPaymentReminderDate,
  toDateInputValue,
} from "@/lib/planning/reminder-dates";
import {
  taxDueSummaryFromCompetence,
  TAX_DUE_LEGEND,
} from "@/lib/planning/tax-due-dates";

export const dynamic = "force-dynamic";

export default async function RevisarNfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ attachCommitmentId?: string }>;
}) {
  const { id, docId } = await params;
  const { attachCommitmentId } = await searchParams;
  const { entitlements, session } = await getWorkspaceContext();
  const doc = await prisma.planningDocument.findFirst({
    where: {
      id: docId,
      planningProjectId: id,
      workspaceId: entitlements.workspaceId,
      kind: { in: ["NF", "RPA"] },
    },
  });
  if (!doc) notFound();

  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
      project: { select: { valorCaptado: true } },
    },
  });
  if (!project?.sheet) notFound();

  const valorCaptado =
    project.project?.valorCaptado != null ? Number(project.project.valorCaptado) : 0;
  const bal = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
  });

  let extracted = (doc.extractedJson || { items: [] }) as ExtractedFiscalDoc;
  if (!extracted.payment) {
    extracted = {
      ...extracted,
      payment: extractPaymentDetails(
        [extracted.serviceDescription, extracted.items?.[0]?.name]
          .filter(Boolean)
          .join("\n"),
      ),
    };
  }
  if (!extracted.taxes && doc.taxesJson) {
    extracted = {
      ...extracted,
      taxes: doc.taxesJson as ExtractedFiscalDoc["taxes"],
      taxTotal: doc.taxTotal != null ? Number(doc.taxTotal) : extracted.taxTotal,
      grossAmount:
        doc.grossAmount != null ? Number(doc.grossAmount) : extracted.grossAmount,
    };
  }

  const cnpj = normalizeCgccpf(extracted.cnpj || "");
  if (cnpj.length === 14 && !extracted.cnaeCode) {
    const company = await lookupCnpj(cnpj);
    if (company?.cnaeCode) {
      extracted = {
        ...extracted,
        cnaeCode: company.cnaeCode,
        cnaeDescription: extracted.cnaeDescription || company.cnaeDescription,
      };
    }
  }

  const historyByLineId: Record<string, number> = {};
  if (cnpj.length === 11 || cnpj.length === 14) {
    const prior = await prisma.catalogEngagement.findMany({
      where: {
        planningProjectId: id,
        budgetLineId: { not: null },
        service: { supplier: { cnpj } },
      },
      select: { budgetLineId: true },
    });
    for (const e of prior) {
      if (!e.budgetLineId) continue;
      historyByLineId[e.budgetLineId] =
        (historyByLineId[e.budgetLineId] || 0) + 1;
    }
  }

  const firstItem = extracted.items?.[0];
  const grossAmount =
    extracted.grossAmount ?? extracted.totalPrice ?? firstItem?.price ?? null;
  const serviceText = [
    extracted.serviceDescription,
    firstItem?.name,
  ]
    .filter(Boolean)
    .join(" ");

  const suggestion = recommendRubric({
    lines: project.sheet.lines.map((l) => {
      const b = bal.lines.get(l.id)!;
      return {
        id: l.id,
        itemName: l.itemName,
        stageName: l.stageName,
        productName: l.productName,
        city: l.city,
        state: l.state,
        categoryHint: l.categoryHint,
        available: b.available,
        isAdmin: isAdminProduct(l.productName),
      };
    }),
    serviceText,
    cnaeDescription: extracted.cnaeDescription,
    city: extracted.city,
    state: extracted.state,
    grossAmount,
    historyByLineId,
  });

  const lineOpts = project.sheet.lines.map((l) => {
    const b = bal.lines.get(l.id)!;
    return {
      id: l.id,
      label: rubricSelectLabel(l),
      sortOrder: l.sortOrder,
      available: b.available,
      isAdmin: isAdminProduct(l.productName),
      stageName: l.stageName,
      itemName: l.itemName,
      productName: l.productName,
      city: l.city,
      state: l.state,
      categoryHint: l.categoryHint,
      suggested: suggestion?.lineId === l.id,
    };
  });

  const kind = doc.kind === "RPA" ? "RPA" : "NF";
  const allowDelete = await canDeleteNf();
  const hasProof =
    (await prisma.planningDocument.count({
      where: {
        workspaceId: entitlements.workspaceId,
        kind: { in: ["PAYMENT_PROOF", "TAX_PROOF"] },
        sourceDocumentId: doc.id,
      },
    })) > 0;

  const attachCommitment = attachCommitmentId
    ? await prisma.rubricCommitment.findFirst({
        where: {
          id: attachCommitmentId,
          workspaceId: entitlements.workspaceId,
          nfPending: true,
          planningProjectId: id,
        },
        select: { id: true, amount: true, budgetLineId: true },
      })
    : null;

  const attachProofAllocations = attachCommitment
    ? (
        await prisma.planningDocument.findFirst({
          where: {
            workspaceId: entitlements.workspaceId,
            kind: "PAYMENT_PROOF",
            OR: [
              { commitmentId: attachCommitment.id },
              {
                allocations: { some: { commitmentId: attachCommitment.id } },
              },
            ],
          },
          include: {
            allocations: {
              select: { budgetLineId: true, sharePct: true, amount: true },
              orderBy: { sharePct: "desc" },
            },
          },
        })
      )?.allocations.map((a) => ({
        budgetLineId: a.budgetLineId,
        sharePct: Number(a.sharePct),
        amount: Number(a.amount),
      })) ?? null
    : null;

  const attachTotalAmount =
    attachProofAllocations?.reduce((s, a) => s + a.amount, 0) ??
    (attachCommitment ? Number(attachCommitment.amount) : null);

  const prefs = await getNotificationPrefs(
    entitlements.workspaceId,
    session?.id,
  );
  const hiredAtForPay = extracted.hiredAt || new Date().toISOString().slice(0, 10);
  const expectedPayAt = defaultExpectedPayFromHiredAt(hiredAtForPay);
  const defaultPaymentReminder = defaultPaymentReminderDate(
    expectedPayAt,
    prefs.dueSoonDaysAhead,
  );

  const taxesForHint = (doc.taxesJson || extracted.taxes || {}) as ExtractedFiscalDoc["taxes"];
  const taxSummary = taxDueSummaryFromCompetence(
    new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(hiredAtForPay)
        ? `${hiredAtForPay}T12:00:00`
        : hiredAtForPay,
    ),
    taxesForHint,
  );
  const taxHintParts: string[] = [];
  if (taxSummary.issAmount > 0 && taxSummary.issDue) {
    taxHintParts.push(
      `ISS (R$ ${taxSummary.issAmount.toFixed(2)}): lembrete no dia ${taxSummary.issDue.toLocaleDateString("pt-BR")}. ${TAX_DUE_LEGEND.iss}`,
    );
  }
  if (taxSummary.federalAmount > 0 && taxSummary.federalDue) {
    taxHintParts.push(
      `Federais (R$ ${taxSummary.federalAmount.toFixed(2)}): lembrete no dia ${taxSummary.federalDue.toLocaleDateString("pt-BR")}. ${TAX_DUE_LEGEND.federal}`,
    );
  }

  const alertWarnings = [...(extracted.warnings ?? [])].filter(Boolean);
  const inlineNotices = [
    ...(doc.errorMessage
      ? doc.errorMessage.split(" · ").filter(Boolean)
      : extracted.extractOk === false
        ? [extracted.notes || "Extração incompleta — preencha os campos manualmente."]
        : []),
  ].filter(
    (v, i, arr) => arr.indexOf(v) === i && !alertWarnings.includes(v),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${id}/nf/nova`}
        breadcrumb={
          <>
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> / Revisar{" "}
            {kind}
          </>
        }
        title={`Revisar e reservar ${kind}`}
        description={doc.filename}
        actions={
          allowDelete && !hasProof ? (
            <DeleteNfButton
              documentId={doc.id}
              documentKind={kind}
              filename={doc.filename}
              redirectTo={`/planejamento/${id}`}
            />
          ) : null
        }
      />
      <NfReviewForm
        documentId={doc.id}
        extracted={extracted}
        documentKind={kind}
        lines={lineOpts}
        suggestedLineId={
          attachCommitment?.budgetLineId || suggestion?.lineId || null
        }
        suggestionReasons={suggestion?.reasons || []}
        attachCommitmentId={attachCommitment?.id ?? null}
        attachAmount={attachTotalAmount}
        initialAllocations={attachProofAllocations}
        defaultExpectedPayAt={toDateInputValue(expectedPayAt)}
        defaultPaymentReminderAt={defaultPaymentReminder}
        taxDueHint={taxHintParts.length ? taxHintParts.join(" ") : null}
        alertWarnings={alertWarnings}
        complianceWarning={inlineNotices.join(" · ") || null}
      />
    </div>
  );
}
