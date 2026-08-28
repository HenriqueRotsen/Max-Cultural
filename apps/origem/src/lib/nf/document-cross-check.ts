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

  for (const m of text.matchAll(/PRONAC[:\s#]*([0-9A-Za-z.\-/]{3,20})/gi)) {
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

export function checkPaymentAmount(params: {
  extractedAmount: number | null | undefined;
  expectedAmount: number;
  tolerance?: number;
}): { error?: string; warning?: string } {
  const { extractedAmount, expectedAmount } = params;
  const tolerance = params.tolerance ?? 0.02;

  if (!(expectedAmount > 0)) return {};

  if (extractedAmount == null || !(extractedAmount > 0)) {
    return {
      warning: `Não foi possível ler o valor do comprovante. Confira se corresponde a R$ ${expectedAmount.toFixed(2)} da NF.`,
    };
  }

  if (!amountsClose(extractedAmount, expectedAmount, tolerance)) {
    return {
      error: `Valor do comprovante (R$ ${extractedAmount.toFixed(2)}) difere do valor da NF (R$ ${expectedAmount.toFixed(2)}).`,
    };
  }

  return {};
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
