export type FiscalNumberExtract = {
  /** Valor canônico para SALIC, arquivo e dedupe. */
  fiscalNumber: string | null;
  /** NFS-e: número da nota (preferido). */
  nfseNumber?: string | null;
  /** NFS-e: número do RPS (referência, não vai ao SALIC). */
  rpsNumber?: string | null;
};

type FiscalExtracted = {
  fiscalNumber?: string | null;
  nfNumber?: string | null;
  invoiceNumber?: string | null;
  nfseNumber?: string | null;
  rpsNumber?: string | null;
};

/** Normaliza número fiscal para exibição/SALIC. */
export function normalizeFiscalNumber(
  raw: string | null | undefined,
  kind: "NF" | "RPA",
): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  if (kind === "RPA") {
    const rpa = s.match(/^(\d{1,6})\s*\/\s*(\d{4})$/);
    if (rpa) {
      const num = String(Number(rpa[1]));
      return `${num}/${rpa[2]}`;
    }
    const digits = s.replace(/\D/g, "");
    return digits || null;
  }

  // NF: só dígitos (número da NFS-e / NF-e).
  const digits = s.replace(/\D/g, "");
  return digits || null;
}

function pickNfseNumber(text: string): string | null {
  const patterns = [
    /n[uú]mero\s+(?:da\s+)?nfs-?e[:\s\n]+(\d{1,12})/i,
    /n[uú]mero\s+(?:da\s+)?nota\s+fiscal[:\s\n]+(\d{1,12})/i,
    /nfs-?e\s*(?:n[ºo°.]?\s*)?(\d{1,12})/i,
    /n[ºo°.]\s*(?:da\s+)?nfs-?e[:\s\n]+(\d{1,12})/i,
    /<NumeroNfse>(\d+)<\/NumeroNfse>/i,
    /<nNF>(\d+)<\/nNF>/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].replace(/^0+(?=\d)/, "") || m[1];
  }
  return null;
}

function pickRpsNumber(text: string): string | null {
  const patterns = [
    /n[uú]mero\s+(?:do\s+)?rps[:\s\n]+(\d{1,12})/i,
    /n[ºo°.]\s*(?:do\s+)?rps[:\s\n]+(\d{1,12})/i,
    /<NumeroRps>(\d+)<\/NumeroRps>/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].replace(/^0+(?=\d)/, "") || m[1];
  }
  return null;
}

function pickRpaNumber(text: string): string | null {
  const patterns = [
    /\bRPA\b[^0-9]{0,30}(\d{1,6}\s*\/\s*\d{4})/i,
    /recibo\s+de\s+pagamento\s+a\s+aut[oô]nomo[^0-9]{0,30}(\d{1,6}\s*\/\s*\d{4})/i,
    /\bRPA\b[^0-9]{0,20}n[ºo°9.]?\s*(\d{1,6}\s*\/\s*\d{4})/i,
    /\bRPA\b[^0-9]{0,20}n[ºo°9.]?\s*(\d{1,6})/i,
    /recibo\s+(?:de\s+)?pagamento\s+aut[oô]nomo[^\d]{0,40}n[ºo°9.]?\s*(\d{1,12})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const raw = m[1].trim();
    if (/\//.test(raw)) return normalizeFiscalNumber(raw, "RPA");
    return normalizeFiscalNumber(raw, "RPA");
  }
  return null;
}

/** Extrai números fiscais do texto do PDF/XML. */
export function extractFiscalNumbersFromText(
  text: string,
  documentKind: "NF" | "RPA",
): FiscalNumberExtract {
  if (documentKind === "RPA") {
    const fiscalNumber = pickRpaNumber(text);
    return { fiscalNumber };
  }

  const nfseNumber = pickNfseNumber(text);
  const rpsNumber = pickRpsNumber(text);
  const fiscalNumber = nfseNumber || rpsNumber;
  return { fiscalNumber, nfseNumber, rpsNumber };
}

/** Resolve o número canônico a partir do JSON salvo. */
export function resolveFiscalNumberFromExtracted(
  extracted: FiscalExtracted | null | undefined,
  kind: "NF" | "RPA" | null,
): string | null {
  if (!kind) return null;

  const direct = normalizeFiscalNumber(
    extracted?.fiscalNumber ||
      extracted?.nfNumber ||
      extracted?.invoiceNumber ||
      (kind === "NF" ? extracted?.nfseNumber : null),
    kind,
  );
  if (direct) return direct;

  if (kind === "NF") {
    return normalizeFiscalNumber(extracted?.nfseNumber || extracted?.rpsNumber, "NF");
  }

  return null;
}

export function fiscalNumberSalicLabel(kind: "NF" | "RPA"): string {
  return kind === "RPA" ? "Número do RPA" : "Número da NFS-e";
}

export function fiscalNumberSalicPlaceholder(kind: "NF" | "RPA"): string {
  return kind === "RPA" ? "Ex.: 26/2026" : "Ex.: 3628";
}

export function fiscalNumberFields(
  text: string,
  documentKind: "NF" | "RPA",
): {
  fiscalNumber: string | null;
  nfseNumber: string | null;
  rpsNumber: string | null;
  nfNumber: string | null;
  invoiceNumber: string | null;
} {
  const nums = extractFiscalNumbersFromText(text, documentKind);
  return {
    fiscalNumber: nums.fiscalNumber,
    nfseNumber: nums.nfseNumber ?? null,
    rpsNumber: nums.rpsNumber ?? null,
    nfNumber: nums.fiscalNumber,
    invoiceNumber: nums.fiscalNumber,
  };
}
