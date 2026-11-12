import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";
import { checkProjectCaps, projectCapsOf } from "@/lib/planning/project-caps";

/**
 * Trava dos limites do projeto (fornecedor e vínculo com o proponente) para um
 * novo pagamento ou reserva, somando o que já foi lançado no projeto. Vale para
 * a reserva da NF/RPA e para o pagamento antecipado. Reembolso não entra na
 * soma do vínculo. Devolve a mensagem de bloqueio, ou null se couber.
 */
export async function checkProjectCapsForPayment(params: {
  project: {
    id: string;
    accountId: string;
    supplierCapPct?: unknown;
    bondCapPct?: unknown;
    rubricOverrunPct?: unknown;
  };
  /** Valor captado, ou o aprovado na planilha quando ainda não há captação. */
  projectTotal: number;
  amount: number;
  cnpj: string;
  supplierName: string;
  hasBond: boolean;
  isReimbursement: boolean;
  /**
   * Lançamentos que já estão no banco mas são este mesmo pagamento (ex.: NF
   * anexada a um pedido ou a um pagamento sem NF): saem da soma "antes".
   */
  excludeEngagementIds?: string[];
  /** Lançamentos do mesmo lote ainda não gravados (ex.: planilha do produtor). */
  pendingInBatch?: Array<{ cnpj: string; amount: number; hasBond: boolean; isReimbursement: boolean }>;
}): Promise<string | null> {
  const { project, cnpj } = params;
  const supplierDoc = normalizeCgccpf(cnpj);
  const accountDoc = normalizeCgccpf(
    (await prisma.salicAccount.findUnique({ where: { id: project.accountId } }))?.cgccpf || "",
  );
  const engagements = await prisma.catalogEngagement.findMany({
    where: {
      planningProjectId: project.id,
      ...(params.excludeEngagementIds?.length
        ? { id: { notIn: params.excludeEngagementIds } }
        : {}),
      OR: [{ commitment: { is: null } }, { commitment: { status: { not: "CANCELLED" } } }],
    },
    select: {
      price: true,
      commitment: { select: { hasBond: true, isReimbursement: true } },
      service: { select: { supplier: { select: { cnpj: true } } } },
    },
  });

  const isProponent = Boolean(accountDoc) && supplierDoc === accountDoc;
  let supplierTotalBefore = 0;
  let bondGroupTotalBefore = 0;
  for (const e of engagements) {
    const doc = normalizeCgccpf(e.service.supplier.cnpj);
    if (doc === supplierDoc) supplierTotalBefore += Number(e.price);
    // Reembolso não entra na soma do vínculo (mesma regra da Auditoria).
    if (e.commitment?.isReimbursement) continue;
    if ((accountDoc && doc === accountDoc) || e.commitment?.hasBond) {
      bondGroupTotalBefore += Number(e.price);
    }
  }

  for (const p of params.pendingInBatch ?? []) {
    const doc = normalizeCgccpf(p.cnpj);
    if (doc === supplierDoc) supplierTotalBefore += p.amount;
    if (p.isReimbursement) continue;
    if ((accountDoc && doc === accountDoc) || p.hasBond) bondGroupTotalBefore += p.amount;
  }

  return checkProjectCaps({
    caps: projectCapsOf(project),
    projectTotal: params.projectTotal,
    amount: params.amount,
    supplierTotalBefore,
    inBondGroup: isProponent || params.hasBond,
    bondGroupTotalBefore,
    supplierName: params.supplierName,
    isReimbursement: params.isReimbursement,
  });
}

/**
 * Ao anexar a NF a um pedido ou a um pagamento sem NF, "tem vínculo?" e "é
 * reembolso?" podem mudar. Se mudaram, os limites são conferidos de novo, sem
 * contar duas vezes os lançamentos que já são este pagamento.
 */
export async function recheckCapsOnAttach(params: {
  planningProjectId: string;
  existing: Array<{ engagementId: string; hasBond: boolean; isReimbursement: boolean }>;
  hasBond: boolean;
  isReimbursement: boolean;
  amount: number;
  cnpj: string;
  supplierName: string;
}): Promise<string | null> {
  const changed = params.existing.some(
    (c) => c.hasBond !== params.hasBond || c.isReimbursement !== params.isReimbursement,
  );
  if (!changed) return null;
  const project = await prisma.planningProject.findUnique({
    where: { id: params.planningProjectId },
    include: { sheet: { select: { totalApproved: true } } },
  });
  if (!project) return "Projeto não encontrado.";
  const valorCaptado = project.valorCaptado != null ? Number(project.valorCaptado) : 0;
  return checkProjectCapsForPayment({
    project,
    projectTotal: valorCaptado > 0 ? valorCaptado : Number(project.sheet?.totalApproved ?? 0),
    amount: params.amount,
    cnpj: params.cnpj,
    supplierName: params.supplierName,
    hasBond: params.hasBond,
    isReimbursement: params.isReimbursement,
    excludeEngagementIds: params.existing.map((c) => c.engagementId),
  });
}
