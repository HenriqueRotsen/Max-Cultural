import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import type { ExtractedTaxes } from "@/lib/nf/extract";
import { isFederalPlanning } from "@/lib/planning/lifecycle";
import { rubricItemNumber } from "@/lib/planning/rubric-label";
import { taxDueSummaryFromCompetence } from "@/lib/planning/tax-due-dates";

/**
 * Pendências financeiras: o que falta pagar, regularizar ou enviar. Vale para
 * um projeto (aba Pendências) ou para todos (Contas a pagar), com a mesma
 * conta nos dois lugares.
 */
export type PendenciaItem = {
  key: string;
  href: string;
  title: string;
  detail: string;
  amount: number;
  date: Date | null;
  late: boolean;
};

export type FinancialPendencias = {
  aPagar: PendenciaItem[];
  pagosSemNf: PendenciaItem[];
  impostos: PendenciaItem[];
  enviarSalic: PendenciaItem[];
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function loadFinancialPendencias(params: {
  workspaceId: string;
  planningProjectId?: string;
}): Promise<FinancialPendencias> {
  const { workspaceId, planningProjectId } = params;
  const today = startOfToday();
  const projectWhere = planningProjectId
    ? { planningProjectId }
    : { planningProject: { closedAt: null } };
  const supplierSelect = {
    engagement: { select: { service: { select: { supplier: { select: { name: true } } } } } },
  } as const;

  const [reserved, paidWithoutNf, docsWithTaxes, paidForSalic] = await Promise.all([
    prisma.rubricCommitment.findMany({
      where: { workspaceId, status: "RESERVED", ...projectWhere },
      include: {
        ...supplierSelect,
        planningProject: { select: { externalCode: true } },
        budgetLine: { select: { itemName: true, sortOrder: true } },
      },
      orderBy: { expectedPayAt: "asc" },
    }),
    prisma.rubricCommitment.findMany({
      where: { workspaceId, status: "PAID", nfPending: true, ...projectWhere },
      include: { ...supplierSelect, planningProject: { select: { externalCode: true } } },
      orderBy: { paidAt: "asc" },
    }),
    prisma.planningDocument.findMany({
      where: {
        workspaceId,
        kind: { in: ["NF", "RPA"] },
        status: "IMPORTED",
        taxTotal: { gt: 0 },
        ...(planningProjectId ? { planningProjectId } : { planningProject: { closedAt: null } }),
        // Guia ligada à nota, ou anexada ao pagamento antes de a nota chegar.
        derivedProofs: { none: { kind: "TAX_PROOF" } },
        OR: [{ commitmentId: null }, { commitment: { documents: { none: { kind: "TAX_PROOF" } } } }],
      },
      select: {
        id: true,
        kind: true,
        commitmentId: true,
        taxTotal: true,
        taxesJson: true,
        extractedJson: true,
        createdAt: true,
        planningProject: { select: { externalCode: true } },
        engagement: { select: { hiredAt: true } },
      },
    }),
    // Envio ao SALIC só existe no projeto (Lei Rouanet).
    planningProjectId
      ? prisma.planningDocument.findMany({
          where: {
            planningProjectId,
            kind: "PAYMENT_PROOF",
            status: "IMPORTED",
            planningProject: { closedAt: null },
            OR: [{ salicComprovanteId: null }, { salicRepublishPending: true }],
          },
          select: {
            id: true,
            salicComprovanteId: true,
            salicRepublishPending: true,
            grossAmount: true,
            commitmentId: true,
            planningProject: { select: { jurisdiction: true } },
            commitment: {
              select: { id: true, amount: true, paidAt: true, ...supplierSelect },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const aPagar: PendenciaItem[] = reserved.map((c) => ({
    key: c.id,
    href: `/planejamento/compromissos/${c.id}`,
    title: c.engagement.service.supplier.name,
    detail: `${planningProjectId ? "" : `${c.planningProject.externalCode} · `}${rubricItemNumber(c.budgetLine.sortOrder)}. ${c.budgetLine.itemName}${c.installmentNumber ? ` · parcela ${c.installmentNumber}` : ""}`,
    amount: Number(c.amount),
    date: c.expectedPayAt,
    late: c.expectedPayAt < today,
  }));

  const pagosSemNf: PendenciaItem[] = paidWithoutNf.map((c) => ({
    key: c.id,
    href: `/planejamento/compromissos/${c.id}`,
    title: c.engagement.service.supplier.name,
    detail: `${planningProjectId ? "" : `${c.planningProject.externalCode} · `}pago em ${c.paidAt ? formatDate(c.paidAt) : "—"}`,
    amount: Number(c.amount),
    date: c.nfReminderAt,
    late: Boolean(c.nfReminderAt && c.nfReminderAt < today),
  }));

  const impostos: PendenciaItem[] = docsWithTaxes
    .map((d) => {
      const ext = (d.extractedJson || {}) as { supplierName?: string | null; hiredAt?: string | null };
      const competence = ext.hiredAt
        ? new Date(`${ext.hiredAt.slice(0, 10)}T12:00:00Z`)
        : (d.engagement?.hiredAt ?? d.createdAt);
      const due = taxDueSummaryFromCompetence(competence, d.taxesJson as ExtractedTaxes | null);
      const first =
        ([due.issDue, due.federalDue].filter(Boolean) as Date[]).sort(
          (a, b) => a.getTime() - b.getTime(),
        )[0] ?? null;
      return {
        key: d.id,
        href: d.commitmentId ? `/planejamento/compromissos/${d.commitmentId}` : "/planejamento",
        title: ext.supplierName || d.kind,
        detail: `${planningProjectId ? "" : `${d.planningProject?.externalCode ?? ""} · `}${d.kind} · guia não anexada`,
        amount: Number(d.taxTotal),
        date: first,
        late: Boolean(first && first < today),
      };
    })
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  const enviarSalic: PendenciaItem[] = paidForSalic
    .filter((p) => isFederalPlanning(p.planningProject?.jurisdiction ?? "") && p.commitment)
    .map((p) => ({
      key: p.id,
      href: `/planejamento/compromissos/${p.commitment!.id}`,
      title: p.commitment!.engagement.service.supplier.name,
      detail: p.salicRepublishPending
        ? "reenviar: chegou documento depois do envio"
        : `pago em ${p.commitment!.paidAt ? formatDate(p.commitment!.paidAt) : "—"} · ainda não enviado`,
      amount: Number(p.grossAmount ?? p.commitment!.amount),
      date: p.commitment!.paidAt,
      late: false,
    }));

  return { aPagar, pagosSemNf, impostos, enviarSalic };
}

export function countFinancialPendencias(p: FinancialPendencias): number {
  return p.aPagar.length + p.pagosSemNf.length + p.impostos.length + p.enviarSalic.length;
}

/** Total da aba Pendências do projeto: financeiras + diferenças com o SALIC. */
export async function countProjectPendencias(planningProjectId: string, workspaceId: string) {
  const { loadSalicPendencias } = await import("@/lib/planning/salic-pendencias");
  const [fin, salic] = await Promise.all([
    loadFinancialPendencias({ workspaceId, planningProjectId }),
    loadSalicPendencias(planningProjectId, workspaceId),
  ]);
  const late = fin.aPagar.filter((i) => i.late).length + fin.pagosSemNf.filter((i) => i.late).length;
  return { total: countFinancialPendencias(fin) + salic.total, late };
}
