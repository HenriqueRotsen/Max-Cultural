/**
 * Extração de NF / RPA: XML NF-e, texto DANFSe/RPA/heurística, Ollama opcional.
 */

import { PDFParse } from "pdf-parse";
import { extractPaymentDetails, type NfPaymentDetails } from "@/lib/nf/payment-details";
import { extractFiscalNumbersFromText, fiscalNumberFields } from "@/lib/nf/fiscal-number";
import { normalizeCnaeCode } from "@/lib/catalog/cnae";

export type ExtractedItem = {
  name: string;
  category?: string | null;
  price?: number | null;
  quantity?: number | null;
};

export type ExtractedTaxes = {
  iss?: number | null;
  irrf?: number | null;
  inss?: number | null;
  csll?: number | null;
  pis?: number | null;
  cofins?: number | null;
  other?: number | null;
};

/** @deprecated use ExtractedFiscalDoc */
export type ExtractedNf = ExtractedFiscalDoc;

export type ExtractedFiscalDoc = {
  documentKind?: "NF" | "RPA";
  personType?: "PJ" | "PF" | null;
  cnpj?: string | null;
  supplierName?: string | null;
  tradeName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  cnaeCode?: string | null;
  cnaeDescription?: string | null;
  hiredAt?: string | null;
  location?: string | null;
  serviceDescription?: string | null;
  pronac?: string | null;
  items: ExtractedItem[];
  /** Valor bruto dos serviços */
  totalPrice?: number | null;
  grossAmount?: number | null;
  netAmount?: number | null;
  taxTotal?: number | null;
  taxes?: ExtractedTaxes | null;
  notes?: string | null;
  payment?: NfPaymentDetails | null;
  /** Número canônico para SALIC (NFS-e ou RPA). */
  fiscalNumber?: string | null;
  /** NFS-e: número da nota. */
  nfseNumber?: string | null;
  /** NFS-e: número do RPS (só referência). */
  rpsNumber?: string | null;
  /** @deprecated use fiscalNumber */
  nfNumber?: string | null;
  /** @deprecated use fiscalNumber */
  invoiceNumber?: string | null;
  extractOk?: boolean;
  /** Texto bruto usado na extração (PDF/XML). */
  rawText?: string | null;
  /** Avisos de consistência (ex.: projeto diferente). */
  warnings?: string[];
};

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

function parseBrMoney(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function pickPronac(text: string): string | null {
  const m =
    text.match(/PRONAC[:\s]*([0-9]{4,8})/i) ||
    text.match(/Pronac[:\s]*([0-9]{4,8})/) ||
    text.match(/\b([0-9]{6,7})\b/);
  return m?.[1] || null;
}

function pickMoney(text: string): number | null {
  const m = text.match(
    /(?:valor\s*(?:total|l[ií]quido|bruto|da\s*nfs-?e)?|total)[^\d]{0,20}R\$\s*([\d.]+,\d{2})/i,
  );
  if (!m?.[1]) {
    const m2 = text.match(/R\$\s*([\d.]+,\d{2})/);
    if (!m2?.[1]) return null;
    return parseBrMoney(m2[1]);
  }
  return parseBrMoney(m[1]);
}

function pickLabeledMoney(text: string, labels: RegExp): number | null {
  const m = text.match(labels);
  if (!m?.[1]) return null;
  return parseBrMoney(m[1]);
}

function pickCnpj(text: string): string | null {
  const m = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  return m ? digitsOnly(m[0]) : null;
}

function pickCpf(text: string): string | null {
  const m = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  if (!m) return null;
  const d = digitsOnly(m[0]);
  return d.length === 11 ? d : null;
}

function pickDate(text: string): string | null {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Número da NF/RPA para prestação de contas no SALIC. */
export function pickFiscalDocumentNumber(
  text: string,
  documentKind: "NF" | "RPA" = "NF",
): string | null {
  return extractFiscalNumbersFromText(text, documentKind).fiscalNumber;
}

/** Nº do documento de pagamento (TED, DOC, autenticação) no comprovante bancário. */
export function pickPaymentDocumentNumber(text: string): string | null {
  const patterns = [
    /\bTED\b[^\d]{0,60}(\d{6,20})/i,
    /n[uú]mero\s+(?:do\s+)?(?:documento|doc\.?|transa[cç][aã]o)[:\s\n]+(\d{6,20})/i,
    /(?:autentica[cç][aã]o|identificador|id\s+transa[cç][aã]o)[:\s\n]+([A-Z0-9]{6,40})/i,
    /\bDOC[:\s]+(\d{6,20})/i,
    /ref[eê]rencia[:\s\n]+(\d{6,20})/i,
    /comprovante[^\d]{0,30}(\d{6,20})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/** Data do pagamento no comprovante (YYYY-MM-DD). */
export function pickPaymentProofDate(text: string): string | null {
  const labeled =
    text.match(
      /(?:data\s+(?:da\s+)?(?:transa[cç][aã]o|pagamento|efetiva[cç][aã]o)|efetivado\s+em|realizado\s+em|pagamento\s+em)[:\s\n]+(\d{2}\/\d{2}\/\d{4})/i,
    )?.[1] || null;
  if (labeled) return pickDate(labeled);
  return pickDate(text);
}

function pickCnae(text: string): { code: string | null; description: string | null } {
  const withDesc =
    text.match(/CNAE[:\s]*([0-9.\-\/]{5,15})\s*[-–—:]?\s*([^\n]{5,120})/i) ||
    text.match(/C[oó]digo\s+CNAE[:\s]*([0-9.\-\/]{5,15})\s*[-–—:]?\s*([^\n]{5,120})/i);
  if (withDesc) {
    return {
      code: normalizeCnaeCode(withDesc[1]),
      description: withDesc[2]?.trim() || null,
    };
  }
  const codeOnly = text.match(/CNAE[:\s]*([0-9.\-\/]{5,15})/i);
  return { code: codeOnly ? normalizeCnaeCode(codeOnly[1]) : null, description: null };
}

function extractTaxes(text: string): ExtractedTaxes {
  return {
    iss: pickLabeledMoney(
      text,
      /(?:ISS(?:QN)?|I\.S\.S\.?)[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ),
    irrf: pickLabeledMoney(
      text,
      /(?:IRRF|I\.R\.R\.F\.?|IR\s*retido)[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ),
    inss: pickLabeledMoney(
      text,
      /(?:INSS|I\.N\.S\.S\.?)[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ),
    csll: pickLabeledMoney(
      text,
      /(?:CSLL)[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ),
    pis: pickLabeledMoney(
      text,
      /(?:\bPIS\b)[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ),
    cofins: pickLabeledMoney(
      text,
      /(?:COFINS)[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ),
    other: pickLabeledMoney(
      text,
      /(?:outras?\s+reten[cç][oõ]es?|outros\s+impostos?)[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ),
  };
}

function taxTotalOf(t: ExtractedTaxes | null | undefined): number {
  if (!t) return 0;
  return (
    (t.iss || 0) +
    (t.irrf || 0) +
    (t.inss || 0) +
    (t.csll || 0) +
    (t.pis || 0) +
    (t.cofins || 0) +
    (t.other || 0)
  );
}

function scaleTaxes(taxes: ExtractedTaxes | null | undefined, share: number): ExtractedTaxes {
  const f = share / 100;
  const scale = (v?: number | null) =>
    v == null ? null : Math.round(v * f * 100) / 100;
  return {
    iss: scale(taxes?.iss),
    irrf: scale(taxes?.irrf),
    inss: scale(taxes?.inss),
    csll: scale(taxes?.csll),
    pis: scale(taxes?.pis),
    cofins: scale(taxes?.cofins),
    other: scale(taxes?.other),
  };
}

export { scaleTaxes, taxTotalOf };

function pickPaymentProofAmount(text: string): number | null {
  return (
    pickLabeledMoney(
      text,
      /valor\s*(?:do\s*)?pagamento[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ) ||
    pickLabeledMoney(
      text,
      /valor\s*pago[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ) ||
    pickLabeledMoney(
      text,
      /valor\s*transferido[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ) ||
    pickLabeledMoney(
      text,
      /valor\s*(?:da\s*)?opera[cç][aã]o[^\d]{0,30}R\$\s*([\d.]+,\d{2})/i,
    ) ||
    pickMoney(text)
  );
}

export type ExtractedProof = {
  rawText: string;
  pronac?: string | null;
  amount?: number | null;
  taxes?: ExtractedTaxes | null;
  taxTotal?: number | null;
  paymentDate?: string | null;
  paymentDocumentNumber?: string | null;
  extractOk: boolean;
};

export async function extractProofFromBuffer(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<ExtractedProof> {
  let text = "";
  if (params.mimeType.includes("pdf") || /\.pdf$/i.test(params.filename)) {
    try {
      text = await extractPdfText(params.buffer);
    } catch {
      return { rawText: "", extractOk: false };
    }
  } else if (
    params.mimeType.startsWith("text/") ||
    params.mimeType.includes("xml") ||
    /\.xml$/i.test(params.filename)
  ) {
    text = params.buffer.toString("utf8");
  }

  const taxes = text ? extractTaxes(text) : {};
  const taxTotal = taxTotalOf(taxes);
  const amount = text ? pickPaymentProofAmount(text) : null;
  const paymentDocumentNumber = text ? pickPaymentDocumentNumber(text) : null;
  const paymentDate = text ? pickPaymentProofDate(text) : null;

  return {
    rawText: text,
    pronac: text ? pickPronac(text) : null,
    amount,
    taxes,
    taxTotal: taxTotal || null,
    paymentDate,
    paymentDocumentNumber,
    extractOk: Boolean(
      text && (amount != null || taxTotal > 0 || paymentDocumentNumber || paymentDate),
    ),
  };
}

function detectKind(text: string, docDigits: string | null): {
  documentKind: "NF" | "RPA";
  personType: "PJ" | "PF";
} {
  if (/recibo\s+de\s+pagamento\s+aut[oô]nomo|\bRPA\b/i.test(text)) {
    return { documentKind: "RPA", personType: "PF" };
  }
  if (docDigits?.length === 11) {
    return { documentKind: "RPA", personType: "PF" };
  }
  return { documentKind: "NF", personType: "PJ" };
}

function heuristicFromText(text: string): ExtractedFiscalDoc {
  const cnpj = pickCnpj(text);
  const cpf = !cnpj ? pickCpf(text) : null;
  const docId = cnpj || cpf;
  const kind = detectKind(text, docId);
  const gross =
    pickLabeledMoney(
      text,
      /valor\s*bruto[^\d]{0,20}R\$\s*([\d.]+,\d{2})/i,
    ) || pickMoney(text);
  const net = pickLabeledMoney(
    text,
    /valor\s*l[ií]quido[^\d]{0,20}R\$\s*([\d.]+,\d{2})/i,
  );
  const taxes = extractTaxes(text);
  const taxTotal = taxTotalOf(taxes);
  const hiredAt = pickDate(text);
  const pronac = pickPronac(text);
  const desc =
    text.match(/Descri[cç][aã]o\s+do\s+[Ss]ervi[cç]o[:\s]*([\s\S]{10,400})/i)?.[1]?.trim() ||
    text.match(/Discrimina[cç][aã]o[:\s]*([\s\S]{10,400})/i)?.[1]?.trim() ||
    null;
  const nameMatch =
    text.match(/Nome\s*(?:Empresarial|do\s+prestador)?[:\s]*([^\n]{3,120})/i) ||
    text.match(/Raz[aã]o\s+Social[:\s]*([^\n]{3,120})/i) ||
    text.match(/Nome[:\s]*([^\n]{3,120})/i);
  const supplierName = nameMatch?.[1]?.trim() || null;
  const items: ExtractedItem[] = desc
    ? [{ name: desc.slice(0, 200), price: gross, quantity: 1 }]
    : gross
      ? [{ name: kind.documentKind === "RPA" ? "Serviço (RPA)" : "Serviço", price: gross, quantity: 1 }]
      : [];
  const cnae = pickCnae(text);
  const payment = extractPaymentDetails([desc, text].filter(Boolean).join("\n"));
  const extractOk = Boolean(docId || supplierName || gross);
  const fiscalNums = fiscalNumberFields(text, kind.documentKind);

  return {
    documentKind: kind.documentKind,
    personType: kind.personType,
    cnpj: docId,
    supplierName,
    serviceDescription: desc,
    cnaeCode: kind.personType === "PJ" ? cnae.code : null,
    cnaeDescription: kind.personType === "PJ" ? cnae.description : null,
    payment,
    taxes,
    taxTotal: taxTotal || null,
    grossAmount: gross,
    netAmount: net ?? (gross != null ? Math.round((gross - taxTotal) * 100) / 100 : null),
    totalPrice: gross,
    pronac,
    hiredAt,
    items,
    ...fiscalNums,
    notes: extractOk ? "extraído por heurística" : "sem texto útil — preencha manualmente",
    extractOk,
  };
}

function parseNfeXml(xml: string): ExtractedFiscalDoc | null {
  if (!/<nfeProc|<NFe[\s>]|<CompNfse|<NFSe/i.test(xml)) return null;
  const cnpj =
    xml.match(/<emit>[\s\S]*?<CNPJ>(\d+)<\/CNPJ>/i)?.[1] ||
    xml.match(/<Prestador[\s\S]*?<Cnpj>(\d+)<\/Cnpj>/i)?.[1] ||
    null;
  const supplierName =
    xml.match(/<emit>[\s\S]*?<xNome>([^<]+)<\/xNome>/i)?.[1] ||
    xml.match(/<RazaoSocial>([^<]+)<\/RazaoSocial>/i)?.[1] ||
    null;
  const tradeName =
    xml.match(/<emit>[\s\S]*?<xFant>([^<]+)<\/xFant>/i)?.[1] || null;
  const total =
    xml.match(/<ICMSTot>[\s\S]*?<vNF>([^<]+)<\/vNF>/i)?.[1] ||
    xml.match(/<vNF>([^<]+)<\/vNF>/i)?.[1] ||
    xml.match(/<ValorServicos>([^<]+)<\/ValorServicos>/i)?.[1] ||
    xml.match(/<ValorLiquidoNfse>([^<]+)<\/ValorLiquidoNfse>/i)?.[1];
  const iss =
    xml.match(/<vISS>([^<]+)<\/vISS>/i)?.[1] ||
    xml.match(/<ValorIss>([^<]+)<\/ValorIss>/i)?.[1];
  const irrf = xml.match(/<ValorIr>([^<]+)<\/ValorIr>/i)?.[1];
  const inss = xml.match(/<ValorInss>([^<]+)<\/ValorInss>/i)?.[1];
  const csll = xml.match(/<ValorCsll>([^<]+)<\/ValorCsll>/i)?.[1];
  const pis = xml.match(/<ValorPis>([^<]+)<\/ValorPis>/i)?.[1];
  const cofins = xml.match(/<ValorCofins>([^<]+)<\/ValorCofins>/i)?.[1];
  const dh =
    xml.match(/<dhEmi>([^<]+)<\/dhEmi>/i)?.[1] ||
    xml.match(/<dEmi>([^<]+)<\/dEmi>/i)?.[1] ||
    xml.match(/<DataEmissao>([^<]+)<\/DataEmissao>/i)?.[1];
  const fiscalNums = fiscalNumberFields(xml, "NF");
  const items: ExtractedItem[] = [];
  const prodRe = /<det[\s\S]*?<xProd>([^<]+)<\/xProd>[\s\S]*?<vProd>([^<]+)<\/vProd>/gi;
  let m: RegExpExecArray | null;
  while ((m = prodRe.exec(xml))) {
    items.push({ name: m[1]!, price: Number(m[2]), quantity: 1 });
  }
  if (items.length === 0) {
    const disc = xml.match(/<Discriminacao>([^<]+)<\/Discriminacao>/i)?.[1];
    if (disc) items.push({ name: disc, price: total ? Number(total) : null, quantity: 1 });
  }
  const hiredAt = dh ? dh.slice(0, 10) : null;
  const cnaeXml =
    xml.match(/<emit>[\s\S]*?<CNAE>([^<]+)<\/CNAE>/i)?.[1] ||
    xml.match(/<CodigoCnae>([^<]+)<\/CodigoCnae>/i)?.[1] ||
    null;
  const taxes: ExtractedTaxes = {
    iss: iss ? Number(iss) : null,
    irrf: irrf ? Number(irrf) : null,
    inss: inss ? Number(inss) : null,
    csll: csll ? Number(csll) : null,
    pis: pis ? Number(pis) : null,
    cofins: cofins ? Number(cofins) : null,
  };
  const gross = total ? Number(total) : items[0]?.price || null;
  const taxTotal = taxTotalOf(taxes);
  const payment = extractPaymentDetails(
    items.map((i) => i.name).join("\n") + "\n" + xml,
  );
  return {
    documentKind: "NF",
    personType: "PJ",
    cnpj,
    supplierName,
    tradeName,
    totalPrice: gross,
    grossAmount: gross,
    taxTotal: taxTotal || null,
    netAmount:
      gross != null ? Math.round((gross - taxTotal) * 100) / 100 : null,
    taxes,
    hiredAt,
    serviceDescription: items[0]?.name || null,
    cnaeCode: normalizeCnaeCode(cnaeXml),
    payment,
    pronac: pickPronac(xml),
    items,
    ...fiscalNums,
    notes: "NF XML",
    extractOk: Boolean(cnpj || supplierName || gross),
  };
}

async function extractWithOllama(text: string): Promise<ExtractedFiscalDoc | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.2";
  try {
    const prompt = `Extraia JSON de nota fiscal ou RPA brasileira. Campos: documentKind(NF|RPA), cnpj, supplierName, tradeName, hiredAt (YYYY-MM-DD), serviceDescription, pronac, totalPrice, grossAmount, netAmount, taxes{iss,irrf,inss,csll,pis,cofins,other}, cnaeCode, cnaeDescription, payment{pixKey,bankName,bankAgency,bankAccount,paymentNotes}, items[{name,price,quantity}]. Texto:\n${text.slice(0, 12000)}`;
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    const match = data.response?.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as ExtractedFiscalDoc;
    const paymentFromText = extractPaymentDetails(
      [parsed.serviceDescription, text].filter(Boolean).join("\n"),
    );
    const payment = parsed.payment
      ? {
          pixKey: parsed.payment.pixKey || paymentFromText.pixKey,
          bankName: parsed.payment.bankName || paymentFromText.bankName,
          bankAgency: parsed.payment.bankAgency || paymentFromText.bankAgency,
          bankAccount: parsed.payment.bankAccount || paymentFromText.bankAccount,
          paymentNotes: parsed.payment.paymentNotes || paymentFromText.paymentNotes,
        }
      : paymentFromText;
    const cnaeFromText = pickCnae(text);
    const taxes = parsed.taxes || extractTaxes(text);
    const gross = parsed.grossAmount ?? parsed.totalPrice ?? null;
    const taxTotal = taxTotalOf(taxes);
    const docDigits = parsed.cnpj ? digitsOnly(String(parsed.cnpj)) : null;
    const kind = detectKind(text, docDigits);
    return {
      ...parsed,
      documentKind: parsed.documentKind || kind.documentKind,
      personType: parsed.personType || kind.personType,
      cnpj: docDigits,
      cnaeCode: normalizeCnaeCode(parsed.cnaeCode) || cnaeFromText.code,
      cnaeDescription: parsed.cnaeDescription || cnaeFromText.description,
      taxes,
      taxTotal: taxTotal || null,
      grossAmount: gross,
      netAmount:
        parsed.netAmount ??
        (gross != null ? Math.round((Number(gross) - taxTotal) * 100) / 100 : null),
      totalPrice: gross,
      payment,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      notes: "ollama",
      extractOk: true,
    };
  } catch {
    return null;
  }
}

function sectionAfter(text: string, startRe: RegExp, endRe: RegExp) {
  const start = text.search(startRe);
  if (start < 0) return "";
  const slice = text.slice(start);
  const endMatch = slice.search(endRe);
  if (endMatch > 0) return slice.slice(0, endMatch);
  return slice;
}

function pickAfterLabel(section: string, label: RegExp) {
  const m = section.match(label);
  if (!m) return null;
  const line = m[1]?.trim();
  if (!line || line === "-" || line === "—") return null;
  return line;
}

/**
 * Extrai emitente/prestador de DANFSe / NFS-e (como no Suply),
 * ignorando o bloco do tomador.
 */
function extractFromDanfseText(text: string): ExtractedFiscalDoc | null {
  const normalized = text.replace(/\r/g, "\n");
  if (!/EMITENTE|Prestador do Servi[cç]o|NFS-e|DANFSe/i.test(normalized)) {
    return null;
  }

  const emitente = sectionAfter(
    normalized,
    /EMITENTE DA NFS-e|Prestador do Servi[cç]o/i,
    /TOMADOR DO SERVI[CÇ]O|INTERMEDI[AÁ]RIO DO SERVI[CÇ]O/i,
  );

  const cnpjMatch = emitente.match(
    /CNPJ\s*\/\s*CPF\s*\/\s*NIF\s*\n?\s*(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}|\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})/i,
  );
  const rawDoc = cnpjMatch?.[1] ? digitsOnly(cnpjMatch[1]) : null;
  const cnpj =
    rawDoc && rawDoc.length === 14
      ? rawDoc
      : rawDoc && rawDoc.length === 11
        ? rawDoc
        : pickCnpj(emitente) || pickCnpj(normalized);
  const cpf =
    rawDoc && rawDoc.length === 11
      ? rawDoc
      : !cnpj || cnpj.length !== 14
        ? pickCpf(emitente)
        : null;
  const docId = (cnpj && cnpj.length === 14 ? cnpj : null) || cpf;

  const name = pickAfterLabel(
    emitente,
    /Nome\s*\/\s*Nome Empresarial\s*\n?\s*(.+)/i,
  );
  const email = pickAfterLabel(emitente, /E-?mail\s*\n?\s*([^\s\n]+@[^\s\n]+)/i);
  const phone = pickAfterLabel(
    emitente,
    /Telefone\s*\n?\s*((?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4})/i,
  );
  const address = pickAfterLabel(emitente, /Endere[cç]o\s*\n?\s*(.+)/i);
  const cityLine = pickAfterLabel(emitente, /Munic[ií]pio\s*\n?\s*(.+)/i);
  const zipCode = pickAfterLabel(
    emitente,
    /CEP\s*\n?\s*(\d{2}\.?\d{3}-?\d{3}|\d{8})/i,
  );

  let city: string | null = null;
  let state: string | null = null;
  if (cityLine) {
    const parts = cityLine.split(/\s*-\s*/);
    city = parts[0]?.trim() || null;
    state = parts[1]?.trim()?.slice(0, 2)?.toUpperCase() || null;
  }

  const hiredAt =
    pickDate(
      pickAfterLabel(
        normalized,
        /Data e Hora da emiss[aã]o da NFS-e\s*\n?\s*([0-3]\d\/[0-1]\d\/\d{4}[^\n]*)/i,
      ) ||
        pickAfterLabel(
          normalized,
          /Compet[eê]ncia da NFS-e\s*\n?\s*([0-3]\d\/[0-1]\d\/\d{4})/i,
        ) ||
        "",
    ) || pickDate(normalized);

  const serviceBlock = sectionAfter(
    normalized,
    /SERVI[CÇ]O PRESTADO|DISCRIMINA[CÇ][AÃ]O DOS SERVI[CÇ]OS/i,
    /TRIBUTA[CÇ][AÃ]O MUNICIPAL|TRIBUTA[CÇ][AÃ]O FEDERAL|VALOR TOTAL DA NFS-E/i,
  );

  let serviceName: string | null = null;
  const descMatch = normalized.match(
    /Descri[cç][aã]o do Servi[cç]o\s*\n([\s\S]*?)(?:\nBanco:|\nTRIBUT|\nVALOR TOTAL|\nAg[eê]ncia:)/i,
  );
  if (descMatch?.[1]) {
    serviceName = descMatch[1].replace(/\s+/g, " ").trim();
  }
  if (!serviceName) {
    serviceName =
      pickAfterLabel(
        serviceBlock,
        /C[oó]digo de Tributa[cç][aã]o Nacional\s*\n?\s*(.+)/i,
      ) || "Serviço da NFS-e";
  }

  const gross =
    pickLabeledMoney(
      normalized,
      /Valor do Servi[cç]o\s*\n?\s*R\$\s*([\d.]+,\d{2})/i,
    ) ||
    pickLabeledMoney(
      normalized,
      /Valor L[ií]quido da NFS-e\s*\n?\s*R\$\s*([\d.]+,\d{2})/i,
    ) ||
    pickLabeledMoney(
      normalized,
      /VALOR TOTAL DA NFS-E[\s\S]{0,120}?R\$\s*([\d.]+,\d{2})/i,
    ) ||
    pickMoney(normalized);

  const net = pickLabeledMoney(
    normalized,
    /Valor L[ií]quido da NFS-e\s*\n?\s*R\$\s*([\d.]+,\d{2})/i,
  );

  const taxes = extractTaxes(normalized);
  const taxTotal = taxTotalOf(taxes);
  const cnae = pickCnae(normalized);
  const payment = extractPaymentDetails(
    [serviceName, normalized].filter(Boolean).join("\n"),
  );
  const supplierName = name
    ?.replace(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{0,4}-?\d{0,2}\s*/, "")
    .trim() || name;

  if (!docId && !supplierName) return null;

  const kind = detectKind(normalized, docId);
  const localPrestacao = pickAfterLabel(
    serviceBlock,
    /Local da Presta[cç][aã]o\s*\n?\s*(.+)/i,
  );
  const fiscalNums = fiscalNumberFields(normalized, kind.documentKind);

  return {
    documentKind: kind.documentKind,
    personType: kind.personType,
    cnpj: docId,
    supplierName,
    email,
    phone,
    address,
    city,
    state,
    zipCode: zipCode ? digitsOnly(zipCode) : null,
    hiredAt,
    location:
      localPrestacao || [city, state].filter(Boolean).join(" - ") || null,
    serviceDescription: serviceName,
    cnaeCode: kind.personType === "PJ" ? cnae.code : null,
    cnaeDescription: kind.personType === "PJ" ? cnae.description : null,
    payment,
    taxes,
    taxTotal: taxTotal || null,
    grossAmount: gross,
    netAmount:
      net ?? (gross != null ? Math.round((gross - taxTotal) * 100) / 100 : null),
    totalPrice: gross,
    pronac: pickPronac(normalized),
    items: [
      {
        name: serviceName.slice(0, 200),
        price: gross,
        quantity: 1,
      },
    ],
    ...fiscalNums,
    notes: "Extraído do EMITENTE/Prestador (DANFSe)",
    extractOk: true,
  };
}

/** Corrige mojibake comum de DANFSe (latin1/Win-1252 lido como UTF-8). */
function softenPdfText(text: string): string {
  return text
    .replace(/ServiÁo/gi, "Serviço")
    .replace(/DescriÁ„o/gi, "Descrição")
    .replace(/PrestaÁ„o/gi, "Prestação")
    .replace(/TributaÁ„o/gi, "Tributação")
    .replace(/DiscriminaÁ„o/gi, "Discriminação")
    .replace(/CompetÍncia/gi, "Competência")
    .replace(/emiss„o/gi, "emissão")
    .replace(/MunicÌpio/gi, "Município")
    .replace(/SERVI«O/gi, "SERVIÇO")
    .replace(/TRIBUTA«√O/gi, "TRIBUTAÇÃO")
    .replace(/LÌquido/gi, "Líquido")
    .replace(/ApuraÁ„o/gi, "Apuração")
    .replace(/C·lculo/gi, "Cálculo")
    .replace(/D[ÈÉ]bito/gi, "Débito")
    .replace(/PrÛpria/gi, "Própria")
    .replace(/ReduÁıes/gi, "Reduções")
    .replace(/DeduÁıes/gi, "Deduções")
    .replace(/INFORMA«’ES/gi, "INFORMAÇÕES")
    .replace(/N√O/gi, "NÃO")
    .replace(/INTERMEDI¡RIO/gi, "INTERMEDIÁRIO")
    .replace(/tÈcnica/gi, "técnica")
    .replace(/ediÁ„o/gi, "edição")
    .replace(/divulgaÁ„o/gi, "divulgação")
    .replace(/AgÍncia/gi, "Agência")
    .replace(/‡/g, "à");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse precisa estar em serverExternalPackages (Next) — igual ao Suply.
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const raw = result.text?.trim() || "";
    return raw ? softenPdfText(raw) : "";
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function extractNfFromBuffer(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<ExtractedFiscalDoc> {
  const isXml =
    params.mimeType.includes("xml") || /\.xml$/i.test(params.filename);
  if (isXml) {
    const xml = params.buffer.toString("utf8");
    const parsed = parseNfeXml(xml) || heuristicFromText(xml);
    return { ...parsed, rawText: xml.slice(0, 50_000) };
  }

  let text = "";
  if (params.mimeType.includes("pdf") || /\.pdf$/i.test(params.filename)) {
    try {
      text = await extractPdfText(params.buffer);
    } catch (err) {
      console.error("[nf/extract] pdf-parse failed:", err);
      return {
        items: [],
        notes: "Falha ao ler o PDF — preencha manualmente",
        extractOk: false,
      };
    }
    if (!text) {
      return {
        items: [],
        notes: "PDF sem texto extraível — preencha manualmente",
        extractOk: false,
      };
    }
  } else {
    text = params.buffer.toString("utf8");
  }

  const danfse = extractFromDanfseText(text);
  if (danfse?.extractOk) {
    const ollama = await extractWithOllama(text);
    if (ollama?.taxes || ollama?.cnaeCode) {
      return {
        ...danfse,
        rawText: text.slice(0, 50_000),
        taxes: ollama.taxes || danfse.taxes,
        taxTotal: ollama.taxTotal ?? danfse.taxTotal,
        cnaeCode: ollama.cnaeCode || danfse.cnaeCode,
        cnaeDescription: ollama.cnaeDescription || danfse.cnaeDescription,
        payment: ollama.payment || danfse.payment,
        pronac: danfse.pronac || ollama.pronac || pickPronac(text),
        notes: `${danfse.notes || "DANFSe"}${ollama.notes ? ` + ${ollama.notes}` : ""}`,
      };
    }
    return { ...danfse, rawText: text.slice(0, 50_000) };
  }

  const ollama = await extractWithOllama(text);
  if (ollama?.cnpj || ollama?.supplierName || ollama?.totalPrice || ollama?.grossAmount) {
    const payment =
      ollama.payment ||
      extractPaymentDetails(
        [ollama.serviceDescription, text].filter(Boolean).join("\n"),
      );
    return {
      ...ollama,
      rawText: text.slice(0, 50_000),
      pronac: ollama.pronac || pickPronac(text),
      serviceDescription:
        ollama.serviceDescription || ollama.items?.[0]?.name || null,
      payment,
      taxes: ollama.taxes || extractTaxes(text),
      taxTotal:
        ollama.taxTotal ??
        (taxTotalOf(ollama.taxes || extractTaxes(text)) || null),
      cnaeCode: ollama.cnaeCode || pickCnae(text).code,
      cnaeDescription: ollama.cnaeDescription || pickCnae(text).description,
      ...fiscalNumberFields(text, ollama.documentKind || "NF"),
      extractOk: true,
    };
  }
  return { ...heuristicFromText(text), rawText: text.slice(0, 50_000) };
}
