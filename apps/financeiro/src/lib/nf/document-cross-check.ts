import type { ExtractedTaxes } from "@/lib/nf/extract";

const TAX_FIELDS = [
  "iss",
  "irrf",
  "inss",
  "csll",
  "pis",
  "cofins",
  "other",
] as const satisfies ReadonlyArray<keyof ExtractedTaxes>;

const TAX_LABELS: Record<(typeof TAX_FIELDS)[number], string> = {
  iss: "ISS",
  irrf: "IRRF",
  inss: "INSS",
  csll: "CSLL",
  pis: "PIS",
  cofins: "COFINS",
  other: "Outros",
};

export function normalizeProjectCode(code: string): string {
  return code.replace(/\D/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Códigos de projeto mencionados explicitamente no texto (PRONAC, nº projeto, etc.). */
export function findProjectCodesInText(text: string): string[] {
  const found = new Set<string>();

  // Aceita separador entre os grupos de dígitos: "25 7797" (o espaço cortava em "25").
  for (const m of text.matchAll(/PRONAC[:\s#nº°o.]*(\d{2}[\s.\-/]\d{4,6}\b|[0-9A-Za-z.\-/]{3,20})/gi)) {
    const raw = String(m[1] || "").trim();
    const digits = normalizeProjectCode(raw);
    if (digits.length >= 4) found.add(digits);
    else if (raw.length >= 3) found.add(raw.toUpperCase());
  }

  for (const m of text.matchAll(
    /(?:projeto|n[º°o]\.?\s*(?:do\s*)?projeto|c[oó]digo\s*(?:do\s*)?projeto)[:\s#]*([0-9A-Za-z.\-/]{3,20})/gi,
  )) {
    const raw = String(m[1] || "").trim();
    const digits = normalizeProjectCode(raw);
    if (digits.length >= 4) found.add(digits);
    else if (raw.length >= 3) found.add(raw.toUpperCase());
  }

  return [...found];
}

function codesMatch(found: string, expected: string): boolean {
  const f = found.trim();
  const e = expected.trim();
  if (!f || !e) return false;
  if (f.toUpperCase() === e.toUpperCase()) return true;
  const fd = normalizeProjectCode(f);
  const ed = normalizeProjectCode(e);
  if (fd && ed && fd === ed) return true;
  if (fd && ed && (fd.endsWith(ed) || ed.endsWith(fd))) return true;
  return false;
}

export function checkProjectCodeInDocument(params: {
  text: string;
  expectedCode: string;
  extractedPronac?: string | null;
}): { warning?: string; foundCodes: string[] } {
  const expected = params.expectedCode.trim();
  if (!expected) return { foundCodes: [] };

  const foundCodes = findProjectCodesInText(params.text);
  if (params.extractedPronac?.trim()) {
    foundCodes.push(params.extractedPronac.trim());
  }

  const literal = new RegExp(`\\b${escapeRegex(expected)}\\b`, "i").test(
    params.text,
  );
  if (literal) {
    return { foundCodes: [...new Set([expected, ...foundCodes])] };
  }

  const expectedDigits = normalizeProjectCode(expected);
  if (expectedDigits.length >= 4) {
    const digitPattern = new RegExp(`\\b${escapeRegex(expectedDigits)}\\b`);
    if (digitPattern.test(params.text.replace(/\D/g, " "))) {
      return { foundCodes: [...new Set([expectedDigits, ...foundCodes])] };
    }
  }

  const unique = [...new Set(foundCodes.map((c) => c.trim()).filter(Boolean))];
  if (unique.length === 0) return { foundCodes: [] };

  if (unique.some((c) => codesMatch(c, expected))) {
    return { foundCodes: unique };
  }

  return {
    foundCodes: unique,
    warning: `O documento menciona o projeto ${unique.join(", ")}, mas você está no projeto ${expected}. Verifique se é o arquivo correto.`,
  };
}

export function amountsClose(
  a: number,
  b: number,
  tolerance = 0.02,
): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * O valor do comprovante de pagamento precisa bater com o esperado (valor da
 * NF/RPA ou o informado no pagamento antecipado). Comprovante sem valor legível
 * também bloqueia: sem conferir o valor, o pagamento não é aprovado.
 */
export function checkPaymentAmount(params: {
  extractedAmount: number | null | undefined;
  expectedAmount: number;
  tolerance?: number;
  /** Como o valor esperado aparece na mensagem (padrão: "da NF"). */
  expectedLabel?: string;
}): { error?: string; warning?: string } {
  const { extractedAmount, expectedAmount } = params;
  const tolerance = params.tolerance ?? 0.02;
  const label = params.expectedLabel ?? "da NF";
  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (!(expectedAmount > 0)) return {};

  if (extractedAmount == null || !(extractedAmount > 0)) {
    return {
      error: `Não foi possível ler o valor do comprovante, então ele não pode ser conferido com o valor ${label} (${brl(expectedAmount)}). Envie o comprovante em PDF ou numa imagem nítida em que o valor apareça.`,
    };
  }

  if (!amountsClose(extractedAmount, expectedAmount, tolerance)) {
    return {
      error: `Valor do comprovante (${brl(extractedAmount)}) difere do valor ${label} (${brl(expectedAmount)}).`,
    };
  }

  return {};
}

export type PaymentAmountReview = {
  /** Valor esperado (NF/RPA, parcela ou lançamento). */
  expected: number;
  /** O que o sistema leu no comprovante (null = não leu). */
  extracted: number | null;
  /** O valor pago passou do esperado: pode ser multa ou juros. */
  overpaid: boolean;
};

/**
 * Conferência do valor do comprovante sem travar por erro de leitura: a pessoa
 * revisa o valor pago quando o sistema não leu ou leu diferente. Continua
 * barrando valor que não bate com a nota (NF de R$ 1.500 e comprovante de
 * R$ 200). Pago a mais só passa marcado como multa/juros — a diferença não sai
 * do projeto e entra no relatório de inconsistências.
 */
export function reviewPaymentAmount(params: {
  extractedAmount: number | null | undefined;
  expectedAmount: number;
  /** Valor pago digitado na revisão (substitui o lido). */
  typedAmount?: number | null;
  /** A pessoa marcou que a diferença a mais é multa/juros. */
  hasFine?: boolean;
  /**
   * Impostos retidos na nota: o fornecedor recebe o líquido (bruto − retido),
   * e o imposto vai por guia. Comprovante no líquido também confere.
   */
  retainedTax?: number;
  tolerance?: number;
  expectedLabel?: string;
}):
  | { ok: true; paidAmount: number; fineAmount: number; corrected: boolean }
  | { ok: false; error: string; review: PaymentAmountReview } {
  const tolerance = params.tolerance ?? 0.02;
  const label = params.expectedLabel ?? "da NF";
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const expected = params.expectedAmount;
  const extracted =
    params.extractedAmount != null && params.extractedAmount > 0 ? params.extractedAmount : null;
  const typed = params.typedAmount != null && params.typedAmount > 0 ? params.typedAmount : null;
  const paid = typed ?? extracted;
  const corrected = typed != null && (extracted == null || !amountsClose(typed, extracted, tolerance));

  if (!(expected > 0)) {
    return { ok: true, paidAmount: paid ?? 0, fineAmount: 0, corrected };
  }
  const review = (overpaid: boolean): PaymentAmountReview => ({ expected, extracted, overpaid });

  if (paid == null) {
    return {
      ok: false,
      error: `O sistema não conseguiu ler o valor do comprovante. Informe abaixo o valor pago (o valor ${label} é ${brl(expected)}).`,
      review: review(false),
    };
  }
  if (amountsClose(paid, expected, tolerance)) {
    return { ok: true, paidAmount: paid, fineAmount: 0, corrected };
  }
  const retained = params.retainedTax && params.retainedTax > 0 ? params.retainedTax : 0;
  const net = Math.round((expected - retained) * 100) / 100;
  if (retained > 0 && amountsClose(paid, net, tolerance)) {
    return { ok: true, paidAmount: paid, fineAmount: 0, corrected };
  }
  if (paid > expected) {
    const diff = Math.round((paid - expected) * 100) / 100;
    if (params.hasFine) {
      return { ok: true, paidAmount: paid, fineAmount: diff, corrected };
    }
    return {
      ok: false,
      error: `O comprovante (${brl(paid)}) é ${brl(diff)} maior que o valor ${label} (${brl(expected)}). Se o sistema leu errado, corrija o valor abaixo. Se foi multa ou juros por atraso, marque a opção.`,
      review: review(true),
    };
  }
  return {
    ok: false,
    error: retained > 0
      ? `O comprovante (${brl(paid)}) é menor que o valor ${label} (${brl(expected)}, ou ${brl(net)} sem os impostos retidos). Se o sistema leu errado, corrija o valor pago abaixo.`
      : `O comprovante (${brl(paid)}) é menor que o valor ${label} (${brl(expected)}). Se o sistema leu errado, corrija o valor pago abaixo: ele precisa bater com o valor ${label}.`,
    review: review(false),
  };
}

/** Lê o valor digitado ("1.549,95", "1549.95") do formulário. */
export function parseTypedAmount(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim().replace(/[^\d.,]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function checkTaxProofAgainstNf(params: {
  extractedTaxes: ExtractedTaxes | null | undefined;
  extractedTaxTotal?: number | null;
  expectedTaxes: ExtractedTaxes | null | undefined;
  expectedTaxTotal?: number | null;
  tolerance?: number;
}): { error?: string; warning?: string } {
  const tolerance = params.tolerance ?? 0.05;
  const expectedTaxes = params.expectedTaxes ?? {};
  const extractedTaxes = params.extractedTaxes ?? {};

  const expectedTotal =
    params.expectedTaxTotal ??
    TAX_FIELDS.reduce((s, f) => s + (expectedTaxes[f] ?? 0), 0);

  if (!(expectedTotal > 0)) return {};

  const extractedTotal =
    params.extractedTaxTotal ??
    TAX_FIELDS.reduce((s, f) => s + (extractedTaxes[f] ?? 0), 0);

  if (!(extractedTotal > 0)) {
    return {
      warning: `Não foi possível ler os impostos no comprovante. Confira se batem com R$ ${expectedTotal.toFixed(2)} retidos na NF.`,
    };
  }

  const mismatches: string[] = [];
  for (const field of TAX_FIELDS) {
    const exp = expectedTaxes[field] ?? 0;
    const got = extractedTaxes[field] ?? 0;
    if (exp > 0 && !amountsClose(got, exp, tolerance)) {
      mismatches.push(
        `${TAX_LABELS[field]}: NF R$ ${exp.toFixed(2)} vs comprovante R$ ${got.toFixed(2)}`,
      );
    }
  }

  if (mismatches.length > 0) {
    return {
      error: `Impostos do comprovante não batem com a NF — ${mismatches.join("; ")}.`,
    };
  }

  if (!amountsClose(extractedTotal, expectedTotal, tolerance)) {
    return {
      error: `Total de impostos no comprovante (R$ ${extractedTotal.toFixed(2)}) difere da NF (R$ ${expectedTotal.toFixed(2)}).`,
    };
  }

  return {};
}

export function mergeWarnings(...parts: Array<string | null | undefined>): string[] {
  return [...new Set(parts.filter(Boolean) as string[])];
}
