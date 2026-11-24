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
