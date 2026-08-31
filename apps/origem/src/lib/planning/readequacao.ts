/**
 * Snapshot e helpers de readequação de planilha (rascunho 24h).
 */

import { prisma } from "@/lib/db";

export type ReadequacaoLineSnap = {
  id: string;
  fonteRecurso: string;
  productName: string;
  stageName: string;
  state: string;
  city: string;
  itemName: string;
  categoryHint: string | null;
  unit: string;
  days: number;
  quantity: number;
  occurrences: number;
  unitPrice: number;
  homologatedAmount: number;
  approvedAmount: number;
  salicComprovado: number | null;
  sortOrder: number;
};

export type ReadequacaoSnapshot = {
  lines: ReadequacaoLineSnap[];
  totalApproved: number;
  valorCaptado: number | null;
  captadoRecebido: number | null;
  captadoTransferido: number | null;
  rendimentos: number | null;
  meta?: { sourceFilename?: string | null; importedAt?: string | null };
};

/** Chave estável para casar linhas locais com a planilha do SALIC. */
export function budgetLineIdentityKey(line: {
  planilhaAprovacaoId?: string | null;
  fonteRecurso: string;
  productName: string;
  stageName: string;
  state: string;
  city: string;
  itemName: string;
}): string {
  const id = String(line.planilhaAprovacaoId || "").trim();
  if (id) return `id:${id}`;
  return `k:${line.fonteRecurso}|${line.productName}|${line.stageName}|${line.state}|${line.city}|${line.itemName}`.toLowerCase();
}

export function moneyN(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function snapshotFromProject(input: {
  lines: Array<{
    id: string;
    fonteRecurso: string;
    productName: string;
    stageName: string;
    state: string;
    city: string;
    itemName: string;
    categoryHint: string | null;
    unit: string;
    days: number;
    quantity: unknown;
    occurrences: unknown;
    unitPrice: unknown;
    homologatedAmount: unknown;
    approvedAmount: unknown;
    salicComprovado: unknown;
    sortOrder: number;
  }>;
  totalApproved: unknown;
  valorCaptado: unknown;
  captadoRecebido: unknown;
  captadoTransferido: unknown;
  rendimentos: unknown;
  sourceFilename?: string | null;
  importedAt?: Date | null;
}): ReadequacaoSnapshot {
  return {
    lines: input.lines.map((l) => ({
      id: l.id,
      fonteRecurso: l.fonteRecurso,
      productName: l.productName,
      stageName: l.stageName,
      state: l.state,
      city: l.city,
      itemName: l.itemName,
      categoryHint: l.categoryHint,
      unit: l.unit,
      days: l.days,
      quantity: moneyN(l.quantity),
      occurrences: moneyN(l.occurrences),
      unitPrice: moneyN(l.unitPrice),
      homologatedAmount: moneyN(l.homologatedAmount),
      approvedAmount: moneyN(l.approvedAmount),
      salicComprovado:
        l.salicComprovado == null ? null : moneyN(l.salicComprovado),
      sortOrder: l.sortOrder,
    })),
    totalApproved: moneyN(input.totalApproved),
    valorCaptado: input.valorCaptado == null ? null : moneyN(input.valorCaptado),
    captadoRecebido:
      input.captadoRecebido == null ? null : moneyN(input.captadoRecebido),
    captadoTransferido:
      input.captadoTransferido == null ? null : moneyN(input.captadoTransferido),
    rendimentos: input.rendimentos == null ? null : moneyN(input.rendimentos),
    meta: {
      sourceFilename: input.sourceFilename ?? null,
      importedAt: input.importedAt?.toISOString() ?? null,
    },
  };
}

export function exportReadequacaoCsv(snap: ReadequacaoSnapshot): string {
  const header = [
    "Fonte",
    "Produto",
    "Etapa",
    "UF",
    "Cidade",
    "Item",
    "Unidade",
    "Qtd",
    "Ocorrencias",
    "Vl Unitario",
    "Valor",
  ];
  const rows = snap.lines.map((l) => {
    const valor = moneyN(l.approvedAmount);
    return [
      l.fonteRecurso,
      l.productName,
      l.stageName,
      l.state,
      l.city,
      l.itemName,
      l.unit,
      l.quantity,
      l.occurrences,
      l.unitPrice,
      valor,
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

/**
 * Valida linhas do snapshot contra a planilha e o reservado.
 * Linhas `new-*` são permitidas; ids desconhecidos ou valor < reservado falham.
 */
export function validateReadequacaoSnapshot(input: {
  lines: Array<{ id: string; itemName?: string; approvedAmount: unknown }>;
  sheetLineIds: Set<string> | Iterable<string>;
  reservedByLine: Map<string, number> | Record<string, number>;
}): { ok: true } | { ok: false; error: string } {
  const sheetIds =
    input.sheetLineIds instanceof Set
      ? input.sheetLineIds
      : new Set(input.sheetLineIds);
  const reserved =
    input.reservedByLine instanceof Map
      ? input.reservedByLine
      : new Map(Object.entries(input.reservedByLine));

  for (const line of input.lines) {
    const id = String(line.id || "");
    if (!id) return { ok: false, error: "Linha sem id" };
    if (!id.startsWith("new-") && !sheetIds.has(id)) {
      return {
        ok: false,
        error: `Linha inválida no rascunho: ${line.itemName || id}`,
      };
    }
    const amount = moneyN(line.approvedAmount);
    if (!(amount >= 0)) {
      return {
        ok: false,
        error: `Valor inválido em ${line.itemName || id}`,
      };
    }
    if (!id.startsWith("new-")) {
      const reservedAmt = reserved.get(id) || 0;
      if (reservedAmt > amount + 1e-6) {
        return {
          ok: false,
          error: `${line.itemName || id}: valor não pode ser menor que o reservado (R$ ${reservedAmt.toFixed(2)})`,
        };
      }
    }
  }
  return { ok: true };
}

export const READEQUACAO_TTL_MS = 24 * 60 * 60 * 1000;

export async function expireOpenReadequacaoDrafts(
  planningProjectId: string,
  workspaceId: string,
) {
  const now = new Date();
  await prisma.planningReadequacaoDraft.updateMany({
    where: {
      planningProjectId,
      workspaceId,
      status: "OPEN",
      expiresAt: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
}
