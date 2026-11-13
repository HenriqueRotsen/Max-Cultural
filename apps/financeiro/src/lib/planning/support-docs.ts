/**
 * Documentos de apoio do lançamento: o que chega além da NF/RPA (ou no lugar
 * dela). Ficam no lançamento, aparecem no Docs e entram no PDF enviado ao
 * SALIC, na ordem do documento principal para o comprovante.
 */

export const SUPPORT_TYPES = ["CONTRATO", "APOLICE", "FATURA", "ORCAMENTO", "BOLETO", "RECIBO"] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

export const SUPPORT_LABEL: Record<SupportType, string> = {
  CONTRATO: "Contrato",
  APOLICE: "Apólice de seguro",
  FATURA: "Fatura",
  ORCAMENTO: "Orçamento",
  BOLETO: "Boleto",
  RECIBO: "Recibo",
};

/** Fazem o papel da NF/RPA (o pagamento não fica com "NF pendente"). */
export const NF_SUBSTITUTES: readonly SupportType[] = ["FATURA", "RECIBO", "APOLICE", "CONTRATO"];

export function replacesNf(type: string | null | undefined): boolean {
  return (NF_SUBSTITUTES as readonly string[]).includes(type ?? "");
}

export function isSupportType(v: unknown): v is SupportType {
  return typeof v === "string" && (SUPPORT_TYPES as readonly string[]).includes(v);
}

/** Ordem no PDF do SALIC: NF/RPA, depois contrato, apólice, fatura, orçamento, boleto, recibo, e por fim o comprovante. */
export function sortSupportDocs<T extends { supportType: string | null }>(docs: T[]): T[] {
  const rank = (t: string | null) => {
    const i = SUPPORT_TYPES.indexOf((t ?? "") as SupportType);
    return i < 0 ? SUPPORT_TYPES.length : i;
  };
  return [...docs].sort((a, b) => rank(a.supportType) - rank(b.supportType));
}

/**
 * Tipo de documento no SALIC quando não há NF/RPA: fatura vale como
 * "Nota fiscal/fatura" (3); os demais vão como "Recibo de pagamento" (4).
 */
export function salicTipoForSupport(types: Array<string | null>): 3 | 4 | null {
  if (types.length === 0) return null;
  return types.includes("FATURA") ? 3 : 4;
}

export type BoletoInfo = { amount: number | null; dueDate: string | null; line: string };

const BOLETO_BASE = Date.UTC(1997, 9, 7); // fator de vencimento 0 = 07/10/1997
const DAY = 24 * 60 * 60 * 1000;

/**
 * Linha digitável do boleto bancário (47 dígitos): valor nos 10 últimos
 * dígitos e vencimento pelo fator (4 dígitos antes do valor). O fator
 * recomeça em 1000 a partir de 22/02/2025.
 */
export function readBoletoLine(text: string): BoletoInfo | null {
  const compact = text.replace(/[^\d\s.]/g, " ");
  const m = compact.match(/\d{5}\.?\d{5}\s*\d{5}\.?\d{6}\s*\d{5}\.?\d{6}\s*\d\s*\d{14}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.length !== 47) return null;
  const factor = Number(digits.slice(33, 37));
  const cents = Number(digits.slice(37, 47));
  let dueDate: string | null = null;
  if (factor > 0) {
    // O mesmo fator vale nos dois ciclos (antes e depois de 22/02/2025):
    // fica a data mais próxima de hoje.
    const t = BOLETO_BASE + factor * DAY;
    const now = Date.now();
    const best = [t, t + 9000 * DAY].sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0]!;
    dueDate = new Date(best).toISOString().slice(0, 10);
  }
  return { amount: cents > 0 ? cents / 100 : null, dueDate, line: digits };
}

/** CNPJ com dígitos verificadores certos (evita pegar pedaço de linha digitável). */
export function isValidCnpj(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** CNPJs válidos que aparecem no texto (só dígitos). */
export function cnpjsInText(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g)) {
    const d = m[0].replace(/\D/g, "");
    if (isValidCnpj(d)) out.add(d);
  }
  return [...out];
}

/** Número do documento (apólice, contrato, fatura…) quando aparece no texto. */
export function supportNumberFromText(type: SupportType, text: string): string | null {
  const words: Record<SupportType, string> = {
    APOLICE: "ap[óo]lice",
    CONTRATO: "contrato",
    FATURA: "fatura",
    RECIBO: "recibo",
    ORCAMENTO: "or[çc]amento",
    BOLETO: "nosso\\s+n[úu]mero",
  };
  const re = new RegExp(`${words[type]}\\s*(?:n[º°o.]*|n[úu]mero|nº)?\\s*[:#]?\\s*([A-Z0-9][A-Z0-9./-]{2,30})`, "i");
  const m = text.match(re);
  if (!m) return null;
  const v = m[1]!.replace(/[.,;:]+$/, "");
  return /\d/.test(v) ? v : null;
}
