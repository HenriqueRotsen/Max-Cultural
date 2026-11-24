/**
 * Lançamento de imposto (atalho): os 3 documentos do imposto retido de um
 * pagamento já registrado. Funções puras, sem banco.
 */

export const TAX_KIND_LABELS = {
  iss: "ISS",
  inss: "INSS",
  irrf: "IRRF",
  pis: "PIS",
  cofins: "COFINS",
  csll: "CSLL",
  other: "Outro imposto",
} as const;

export type TaxKind = keyof typeof TAX_KIND_LABELS;

/** Os três documentos do imposto. */
export const TAX_DOC_TYPES = {
  GUIA: "Guia do imposto",
  NF_IMPOSTO: "Nota fiscal do imposto",
  COMPROVANTE: "Comprovante de pagamento do imposto",
} as const;

export type TaxDocType = keyof typeof TAX_DOC_TYPES;

export function isTaxKind(v: string): v is TaxKind {
  return Object.prototype.hasOwnProperty.call(TAX_KIND_LABELS, v);
}

/** Impostos retidos na nota (só os com valor), na ordem da lista. */
export function retainedTaxes(taxesJson: unknown): Array<{ kind: TaxKind; label: string; amount: number }> {
  const t = (taxesJson ?? {}) as Record<string, unknown>;
  return (Object.keys(TAX_KIND_LABELS) as TaxKind[])
    .map((kind) => ({ kind, label: TAX_KIND_LABELS[kind], amount: Number(t[kind] ?? 0) }))
    .filter((x) => Number.isFinite(x.amount) && x.amount > 0);
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** Rubrica de um pagamento (rateio da NF/RPA). */
export type TaxRubric = { allocationId: string; label: string; amount: number };

/**
 * Sugestão de quanto do imposto vai para cada rubrica do pagamento: na
 * proporção do valor de cada rubrica na nota. O último pedaço fica com os
 * centavos, para a soma fechar no imposto.
 */
export function suggestTaxByRubric(rubrics: TaxRubric[], tax: number): Record<string, number> {
  const total = rubrics.reduce((s, r) => s + r.amount, 0);
  const out: Record<string, number> = {};
  if (rubrics.length === 0 || !(total > 0) || !(tax > 0)) return out;
  let used = 0;
  rubrics.forEach((r, i) => {
    const v = i === rubrics.length - 1 ? cents(tax - used) : cents((r.amount / total) * tax);
    used = cents(used + v);
    out[r.allocationId] = v;
  });
  return out;
}

/** Um pagamento coberto pela guia: quanto do imposto vai para cada rubrica. */
export type TaxGuideItem = { nfId: string; rubricas: Array<{ allocationId: string; amount: number }> };

/** Confere a divisão da guia entre pagamentos e rubricas (sem banco). */
export function validateTaxGuideItems(items: TaxGuideItem[]): string | null {
  if (items.length === 0) return "Escolha ao menos um pagamento desta guia.";
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.nfId)) return "O mesmo pagamento entrou duas vezes.";
    seen.add(it.nfId);
    if (it.rubricas.some((r) => !Number.isFinite(r.amount) || r.amount < 0)) {
      return "Valor do imposto inválido em uma rubrica.";
    }
    if (!it.rubricas.some((r) => r.amount > 0)) {
      return "Cada pagamento precisa de imposto em ao menos uma rubrica.";
    }
  }
  return null;
}

export function taxGuideTotal(items: TaxGuideItem[]): number {
  return cents(items.reduce((s, it) => s + it.rubricas.reduce((a, r) => a + r.amount, 0), 0));
}
