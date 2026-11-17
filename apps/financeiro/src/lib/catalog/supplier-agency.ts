import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";

/**
 * Fornecedor agência (intermediária): só `pct`% do que foi pago a ele conta
 * nos limites de fornecedor e de vínculo. Chave: CNPJ só com dígitos.
 */
export type AgencyMap = Map<string, number>;

/** Fator (0–1) que multiplica o valor pago; 1 quando não é agência. */
export function agencyFactor(map: AgencyMap, cnpj: string): number {
  const pct = map.get(normalizeCgccpf(cnpj));
  return pct == null ? 1 : Math.min(100, Math.max(0, pct)) / 100;
}

export async function loadAgencyMap(workspaceId: string): Promise<AgencyMap> {
  const rows = await prisma.supplierAgency.findMany({
    where: { workspaceId },
    select: { cnpj: true, pct: true },
  });
  return new Map(rows.map((r) => [r.cnpj, Number(r.pct)]));
}

export async function getAgencyPct(workspaceId: string, cnpj: string): Promise<number | null> {
  const doc = normalizeCgccpf(cnpj);
  if (!doc) return null;
  const row = await prisma.supplierAgency.findUnique({
    where: { workspaceId_cnpj: { workspaceId, cnpj: doc } },
    select: { pct: true },
  });
  return row ? Number(row.pct) : null;
}

/**
 * Lê o percentual do formulário. Vazio = não é agência. Devolve erro se o
 * número não estiver entre 0,01 e 99,99 (100% é o mesmo que não ser agência).
 */
export function parseAgencyPct(raw: unknown): number | null | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace("%", "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 100) {
    return { error: "O percentual da agência precisa ser maior que 0% e menor que 100%." };
  }
  return Math.round(n * 100) / 100;
}

export const fmtAgencyPct = (pct: number) =>
  `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/**
 * Grava (ou tira) a marcação de agência do CNPJ no espaço de trabalho e
 * registra no log quando muda. `pct` null = não é agência.
 */
export async function saveAgencyPct(params: {
  workspaceId: string;
  cnpj: string;
  pct: number | null;
  actorUserId: string | null;
  writeLog: (meta: { cnpj: string; antes: number | null; depois: number | null }) => Promise<void>;
}): Promise<void> {
  const doc = normalizeCgccpf(params.cnpj);
  if (!doc) return;
  const before = await getAgencyPct(params.workspaceId, doc);
  if (before === params.pct) return;
  if (params.pct == null) {
    await prisma.supplierAgency.deleteMany({
      where: { workspaceId: params.workspaceId, cnpj: doc },
    });
  } else {
    await prisma.supplierAgency.upsert({
      where: { workspaceId_cnpj: { workspaceId: params.workspaceId, cnpj: doc } },
      create: {
        workspaceId: params.workspaceId,
        cnpj: doc,
        pct: params.pct,
        updatedById: params.actorUserId,
      },
      update: { pct: params.pct, updatedById: params.actorUserId },
    });
  }
  await params.writeLog({ cnpj: doc, antes: before, depois: params.pct });
}
