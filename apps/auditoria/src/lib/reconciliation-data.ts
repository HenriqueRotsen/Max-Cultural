import { prisma } from "@/lib/db";
import { excludeProjects, hiddenProjectIds } from "@/lib/compliance/over-limit-visibility";
import { findDuplicatePayments, reconcileProject, type ProjectReconciliation } from "@/lib/reconciliation";

export type ProjectReconciliationRow = ProjectReconciliation & {
  projectId: string;
  pronac: string;
  name: string | null;
  situacao: string | null;
  accountId: string;
  accountName: string;
};

/**
 * Captado × pago dos projetos do workspace (ou só de `projectIds`), com
 * duplicidades e o que foge do esperado. Projetos sem captado nem pagamento ficam de fora.
 */
export async function loadReconciliation(params: {
  workspaceId: string;
  projectIds?: string[];
}): Promise<ProjectReconciliationRow[]> {
  const hidden = await hiddenProjectIds();
  const projects = await prisma.project.findMany({
    where: {
      salicAccount: { workspaceId: params.workspaceId },
      ...(params.projectIds ? { id: { in: params.projectIds } } : {}),
      ...excludeProjects(hidden),
    },
    select: {
      id: true,
      pronac: true,
      name: true,
      situacao: true,
      lifecycleStatus: true,
      valorCaptado: true,
      salicAccount: { select: { id: true, name: true } },
    },
  });
  if (!projects.length) return [];
  const ids = projects.map((p) => p.id);

  const [paid, sponsorDates, dupGroups] = await Promise.all([
    prisma.payment.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids } },
      _sum: { amount: true },
      _min: { paymentDate: true },
      _max: { paymentDate: true },
    }),
    prisma.projectSponsorship.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids } },
      _min: { receivedAt: true },
    }),
    prisma.payment.groupBy({
      by: ["projectId", "supplierId", "amount", "documentNumber", "paymentDocumentNumber", "planilhaAprovacaoId"],
      where: { projectId: { in: ids } },
      _count: { _all: true },
      having: { id: { _count: { gt: 1 } } },
    }),
  ]);

  const dupProjectIds = [...new Set(dupGroups.map((g) => g.projectId))];
  const dupRows = dupProjectIds.length
    ? await prisma.payment.findMany({
        where: {
          OR: dupGroups.map((g) => ({
            projectId: g.projectId,
            supplierId: g.supplierId,
            amount: g.amount,
            documentNumber: g.documentNumber,
            paymentDocumentNumber: g.paymentDocumentNumber,
            planilhaAprovacaoId: g.planilhaAprovacaoId,
          })),
        },
        select: {
          projectId: true,
          supplierId: true,
          amount: true,
          documentNumber: true,
          paymentDocumentNumber: true,
          planilhaAprovacaoId: true,
          itemName: true,
          paymentDate: true,
          supplier: { select: { name: true } },
        },
      })
    : [];

  const paidBy = new Map(paid.map((p) => [p.projectId, p]));
  const sponsorBy = new Map(sponsorDates.map((s) => [s.projectId, s._min.receivedAt]));
  const dupRowsBy = new Map<string, typeof dupRows>();
  for (const r of dupRows) dupRowsBy.set(r.projectId, [...(dupRowsBy.get(r.projectId) ?? []), r]);

  const out: ProjectReconciliationRow[] = [];
  for (const p of projects) {
    const pay = paidBy.get(p.id);
    const captado = p.valorCaptado != null ? Number(p.valorCaptado) : 0;
    const pago = Number(pay?._sum.amount ?? 0);
    if (captado <= 0 && pago <= 0) continue;
    const duplicates = findDuplicatePayments(
      (dupRowsBy.get(p.id) ?? []).map((r) => ({
        supplierId: r.supplierId,
        supplierName: r.supplier.name,
        amount: Number(r.amount),
        documentNumber: r.documentNumber,
        paymentDocumentNumber: r.paymentDocumentNumber,
        planilhaAprovacaoId: r.planilhaAprovacaoId,
        itemName: r.itemName,
        paymentDate: r.paymentDate,
      })),
    );
    out.push({
      projectId: p.id,
      pronac: p.pronac,
      name: p.name,
      situacao: p.situacao,
      accountId: p.salicAccount.id,
      accountName: p.salicAccount.name,
      ...reconcileProject({
        captado,
        pago,
        situacao: p.situacao,
        lifecycleStatus: p.lifecycleStatus,
        firstMoneyAt: sponsorBy.get(p.id) ?? pay?._min.paymentDate ?? null,
        lastPaymentAt: pay?._max.paymentDate ?? null,
        duplicates,
      }),
    });
  }
  return out;
}
