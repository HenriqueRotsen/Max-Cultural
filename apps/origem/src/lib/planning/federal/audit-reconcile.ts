import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";
import { n } from "@/lib/planning/rubric-balance";

export type AuditPlanningMatchStatus =
  | "ALIGNED"
  | "AUDIT_ONLY"
  | "PLANNING_ONLY"
  | "DIVERGENT";

export type AuditPlanningMatchRow = {
  status: AuditPlanningMatchStatus;
  paymentId: string | null;
  paymentExternalId: string | null;
  commitmentId: string | null;
  proofId: string | null;
  planilhaAprovacaoId: string | null;
  rubricItem: string | null;
  supplierName: string;
  supplierDoc: string;
  auditAmount: number | null;
  planningAmount: number | null;
  paymentDate: string | null;
};

export type AuditPlanningReconcileCounts = {
  aligned: number;
  auditOnly: number;
  planningOnly: number;
  divergent: number;
};

export type AuditPlanningReconcileReport = {
  linkedToAudit: boolean;
  auditProjectId: string | null;
  rows: AuditPlanningMatchRow[];
  counts: AuditPlanningReconcileCounts;
  /** Valor local já publicado ao SALIC, por budgetLineId. */
  publishedPaidByLine: Record<string, number>;
};

/** Soma alocações locais já publicadas ao SALIC (proof com salicComprovanteId). */
export async function loadPublishedPaidByLine(
  planningProjectId: string,
): Promise<Record<string, number>> {
  const proofs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: { not: null },
    },
    select: {
      allocations: {
        select: {
          budgetLineId: true,
          amount: true,
          commitment: { select: { amount: true, status: true } },
        },
      },
    },
  });

  const byLine: Record<string, number> = {};
  for (const proof of proofs) {
    for (const alloc of proof.allocations) {
      if (alloc.commitment.status === "CANCELLED") continue;
      const amt = n(alloc.amount ?? alloc.commitment.amount);
      byLine[alloc.budgetLineId] = (byLine[alloc.budgetLineId] ?? 0) + amt;
    }
  }
  return byLine;
}

/**
 * Cruza pagamentos da Auditoria (Payment) com comprovantes/reservas do Planejamento.
 * Match primário: Payment.externalId === PlanningDocument.salicComprovanteId.
 */
export async function buildAuditPlanningReconcileReport(
  planningProjectId: string,
): Promise<AuditPlanningReconcileReport> {
  const project = await prisma.planningProject.findUniqueOrThrow({
    where: { id: planningProjectId },
    select: { id: true, projectId: true },
  });

  const emptyCounts: AuditPlanningReconcileCounts = {
    aligned: 0,
    auditOnly: 0,
    planningOnly: 0,
    divergent: 0,
  };

  const publishedPaidByLine = await loadPublishedPaidByLine(planningProjectId);

  const proofs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
    },
    select: {
      id: true,
      salicComprovanteId: true,
      allocations: {
        select: {
          commitmentId: true,
          amount: true,
          budgetLine: {
            select: { planilhaAprovacaoId: true, itemName: true },
          },
          commitment: {
            select: {
              id: true,
              amount: true,
              status: true,
              engagement: {
                select: {
                  service: {
                    select: {
                      supplier: { select: { name: true, cnpj: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  function rowFromProof(
    proof: (typeof proofs)[number],
    status: AuditPlanningMatchStatus,
  ): AuditPlanningMatchRow | null {
    const alloc = proof.allocations[0];
    if (!alloc) return null;
    return {
      status,
      paymentId: null,
      paymentExternalId: proof.salicComprovanteId,
      commitmentId: alloc.commitmentId,
      proofId: proof.id,
      planilhaAprovacaoId: alloc.budgetLine.planilhaAprovacaoId,
      rubricItem: alloc.budgetLine.itemName,
      supplierName: alloc.commitment.engagement.service.supplier.name,
      supplierDoc: alloc.commitment.engagement.service.supplier.cnpj,
      auditAmount: null,
      planningAmount: n(alloc.amount ?? alloc.commitment.amount),
      paymentDate: null,
    };
  }

  if (!project.projectId) {
    const rows: AuditPlanningMatchRow[] = [];
    for (const proof of proofs) {
      const row = rowFromProof(proof, "PLANNING_ONLY");
      if (row) rows.push(row);
    }
    return {
      linkedToAudit: false,
      auditProjectId: null,
      rows,
      counts: { ...emptyCounts, planningOnly: rows.length },
      publishedPaidByLine,
    };
  }

  const payments = await prisma.payment.findMany({
    where: { projectId: project.projectId },
    select: {
      id: true,
      externalId: true,
      amount: true,
      paymentDate: true,
      itemName: true,
      planilhaAprovacaoId: true,
      supplier: { select: { name: true, cgccpf: true } },
    },
    orderBy: { paymentDate: "desc" },
  });

  const proofByExternalId = new Map<string, (typeof proofs)[number]>();
  for (const proof of proofs) {
    if (proof.salicComprovanteId) {
      proofByExternalId.set(proof.salicComprovanteId, proof);
    }
  }

  const matchedProofIds = new Set<string>();
  const rows: AuditPlanningMatchRow[] = [];

  for (const payment of payments) {
    const ext = payment.externalId?.trim() || null;
    const proof = ext ? proofByExternalId.get(ext) : undefined;
    const alloc = proof?.allocations[0];
    const auditAmount = n(payment.amount);
    const planningAmount = alloc ? n(alloc.amount ?? alloc.commitment.amount) : null;

    if (proof && alloc) {
      matchedProofIds.add(proof.id);
      const amountDiff =
        planningAmount != null && Math.abs(planningAmount - auditAmount) > 0.05;
      rows.push({
        status: amountDiff ? "DIVERGENT" : "ALIGNED",
        paymentId: payment.id,
        paymentExternalId: ext,
        commitmentId: alloc.commitmentId,
        proofId: proof.id,
        planilhaAprovacaoId:
          alloc.budgetLine.planilhaAprovacaoId || payment.planilhaAprovacaoId,
        rubricItem: alloc.budgetLine.itemName || payment.itemName,
        supplierName: alloc.commitment.engagement.service.supplier.name,
        supplierDoc: alloc.commitment.engagement.service.supplier.cnpj,
        auditAmount,
        planningAmount,
        paymentDate: payment.paymentDate?.toISOString() ?? null,
      });
      continue;
    }

    rows.push({
      status: "AUDIT_ONLY",
      paymentId: payment.id,
      paymentExternalId: ext,
      commitmentId: null,
      proofId: null,
      planilhaAprovacaoId: payment.planilhaAprovacaoId,
      rubricItem: payment.itemName,
      supplierName: payment.supplier.name,
      supplierDoc: normalizeCgccpf(payment.supplier.cgccpf),
      auditAmount,
      planningAmount: null,
      paymentDate: payment.paymentDate?.toISOString() ?? null,
    });
  }

  for (const proof of proofs) {
    if (matchedProofIds.has(proof.id)) continue;
    const row = rowFromProof(proof, "PLANNING_ONLY");
    if (row) rows.push(row);
  }

  const counts = { ...emptyCounts };
  for (const row of rows) {
    if (row.status === "ALIGNED") counts.aligned += 1;
    else if (row.status === "AUDIT_ONLY") counts.auditOnly += 1;
    else if (row.status === "PLANNING_ONLY") counts.planningOnly += 1;
    else counts.divergent += 1;
  }

  return {
    linkedToAudit: true,
    auditProjectId: project.projectId,
    rows,
    counts,
    publishedPaidByLine,
  };
}

/** Liga engagements de planejamento ao Payment da auditoria quando o id SALIC bate. */
export async function linkPlanningEngagementsToAuditPayments(
  planningProjectId: string,
): Promise<number> {
  const project = await prisma.planningProject.findUnique({
    where: { id: planningProjectId },
    select: { projectId: true },
  });
  if (!project?.projectId) return 0;

  const proofs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: { not: null },
    },
    select: {
      salicComprovanteId: true,
      allocations: {
        select: {
          commitment: {
            select: {
              engagementId: true,
              engagement: { select: { id: true, salicPaymentId: true } },
            },
          },
        },
      },
    },
  });

  const payments = await prisma.payment.findMany({
    where: { projectId: project.projectId, externalId: { not: null } },
    select: { id: true, externalId: true },
  });
  const paymentByExternal = new Map(
    payments
      .filter((p): p is { id: string; externalId: string } => Boolean(p.externalId))
      .map((p) => [p.externalId, p.id] as const),
  );

  let linked = 0;
  for (const proof of proofs) {
    const ext = proof.salicComprovanteId;
    if (!ext) continue;
    const paymentId = paymentByExternal.get(ext);
    if (!paymentId) continue;

    for (const alloc of proof.allocations) {
      const eng = alloc.commitment.engagement;
      if (eng.salicPaymentId === paymentId) continue;
      if (eng.salicPaymentId && eng.salicPaymentId !== paymentId) continue;

      const taken = await prisma.catalogEngagement.findFirst({
        where: { salicPaymentId: paymentId, id: { not: eng.id } },
        select: { id: true },
      });
      if (taken) continue;

      await prisma.catalogEngagement.update({
        where: { id: alloc.commitment.engagementId },
        data: { salicPaymentId: paymentId },
      });
      linked += 1;
    }
  }

  return linked;
}

/**
 * Ao espelhar um Payment: se já existe proof planning com o mesmo id SALIC,
 * liga o engagement da reserva e retorna true (não criar mirror AUDIT).
 */
export async function tryLinkPaymentToPlanningEngagement(params: {
  paymentId: string;
  paymentExternalId: string | null;
  workspaceId: string;
}): Promise<boolean> {
  if (!params.paymentExternalId) return false;

  const proof = await prisma.planningDocument.findFirst({
    where: {
      workspaceId: params.workspaceId,
      kind: "PAYMENT_PROOF",
      status: "IMPORTED",
      salicComprovanteId: params.paymentExternalId,
    },
    select: {
      allocations: {
        select: {
          commitment: {
            select: {
              engagementId: true,
              engagement: { select: { id: true, salicPaymentId: true } },
            },
          },
        },
      },
    },
  });
  if (!proof?.allocations[0]) return false;

  const eng = proof.allocations[0].commitment.engagement;
  if (eng.salicPaymentId === params.paymentId) return true;
  if (eng.salicPaymentId && eng.salicPaymentId !== params.paymentId) return true;

  const taken = await prisma.catalogEngagement.findFirst({
    where: { salicPaymentId: params.paymentId, id: { not: eng.id } },
    select: { id: true },
  });
  if (taken) return true;

  await prisma.catalogEngagement.update({
    where: { id: proof.allocations[0].commitment.engagementId },
    data: { salicPaymentId: params.paymentId },
  });
  return true;
}
