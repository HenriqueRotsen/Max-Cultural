/** Limites do projeto (em % do valor captado), informados ao começar o projeto. */
export type ProjectCaps = {
  supplierCapPct: number;
  bondCapPct: number;
  rubricOverrunPct: number;
};

export const DEFAULT_PROJECT_CAPS: ProjectCaps = {
  supplierCapPct: 20,
  bondCapPct: 20,
  rubricOverrunPct: 100,
};

function pct(v: unknown, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function projectCapsOf(p: {
  supplierCapPct?: unknown;
  bondCapPct?: unknown;
  rubricOverrunPct?: unknown;
}): ProjectCaps {
  return {
    supplierCapPct: pct(p.supplierCapPct, DEFAULT_PROJECT_CAPS.supplierCapPct),
    bondCapPct: pct(p.bondCapPct, DEFAULT_PROJECT_CAPS.bondCapPct),
    rubricOverrunPct: pct(p.rubricOverrunPct, DEFAULT_PROJECT_CAPS.rubricOverrunPct),
  };
}

/** Lê e valida os três percentuais do formulário (vazio = padrão). */
export function parseProjectCaps(formData: FormData): ProjectCaps | { error: string } {
  const read = (key: keyof ProjectCaps, max: number) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return DEFAULT_PROJECT_CAPS[key];
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > max) return NaN;
    return Math.round(n * 100) / 100;
  };
  const caps = {
    supplierCapPct: read("supplierCapPct", 100),
    bondCapPct: read("bondCapPct", 100),
    rubricOverrunPct: read("rubricOverrunPct", 1000),
  };
  if (Number.isNaN(caps.supplierCapPct) || Number.isNaN(caps.bondCapPct)) {
    return { error: "Os limites de fornecedor e de vínculo precisam estar entre 0% e 100%." };
  }
  if (Number.isNaN(caps.rubricOverrunPct)) {
    return { error: "O excesso permitido na rubrica precisa estar entre 0% e 1000%." };
  }
  return caps;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Confere os limites do projeto para um novo pagamento:
 * - mesmo fornecedor: até `supplierCapPct` do captado;
 * - proponente + quem tem vínculo com ele, somados: até `bondCapPct`.
 * Devolve a mensagem de bloqueio, ou null se couber.
 */
export function checkProjectCaps(params: {
  caps: ProjectCaps;
  projectTotal: number;
  amount: number;
  supplierTotalBefore: number;
  /** Fornecedor é o próprio proponente ou foi marcado com vínculo. */
  inBondGroup: boolean;
  bondGroupTotalBefore: number;
  supplierName: string;
}): string | null {
  const { caps, projectTotal, amount } = params;
  if (!(projectTotal > 0) || !(amount > 0)) return null;
  const supplierAfter = params.supplierTotalBefore + amount;
  const supplierLimit = (projectTotal * caps.supplierCapPct) / 100;
  if (!params.inBondGroup && supplierAfter > supplierLimit + 0.005) {
    return `${params.supplierName} passaria de ${fmt(caps.supplierCapPct)}% do valor captado (${brl(supplierAfter)} de ${brl(projectTotal)}; limite ${brl(supplierLimit)}).`;
  }
  if (params.inBondGroup) {
    const bondAfter = params.bondGroupTotalBefore + amount;
    const bondLimit = (projectTotal * caps.bondCapPct) / 100;
    if (bondAfter > bondLimit + 0.005) {
      return `Pagamentos ao proponente e a quem tem vínculo com ele passariam de ${fmt(caps.bondCapPct)}% do valor captado (${brl(bondAfter)} de ${brl(projectTotal)}; limite ${brl(bondLimit)}).`;
    }
  }
  return null;
}
