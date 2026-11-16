import { rubricItemNumber } from "@/lib/planning/rubric-label";
import { resolveFiscalNumberFromExtracted } from "@/lib/nf/fiscal-number";

type FiscalExtracted = {
  fiscalNumber?: string | null;
  nfNumber?: string | null;
  invoiceNumber?: string | null;
  nfseNumber?: string | null;
  rpsNumber?: string | null;
  documentKind?: "NF" | "RPA" | null;
  hiredAt?: string | null;
  payment?: { pixKey?: string | null; bankAccount?: string | null } | null;
};

type ProofExtracted = {
  paymentDate?: string | null;
  paymentDocumentNumber?: string | null;
};

/** Nome do fornecedor como está no cadastro, sem acento nem caracteres que quebram o arquivo. */
function cleanSupplier(value: string, max = 80): string {
  const s = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w .&-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Fornecedor").slice(0, max).trim();
}

/** Número do documento sem barra (ex.: "26/2026" → "26-2026", "S/N" → "S-N"). */
function cleanDocNumber(value: string): string {
  const s = value.trim().replace(/[\\/]+/g, "-").replace(/[^\w.-]+/g, "");
  return s || "S-N";
}

/**
 * Nome do arquivo enviado ao SALIC: `{item}- {tipo} {número}- {fornecedor}.pdf`
 * (ex.: "139- NF 29- Rayane Silva.pdf"). O item é o número do item na
 * planilha; o tipo é NF, RPA ou o documento que faz o papel da nota.
 */
export function buildSalicUploadFilename(params: {
  itemNumber: number | null;
  /** NF, RPA, Fatura, Apolice… (padrão: NF). */
  docLabel?: string | null;
  fiscalDocNumber: string;
  supplierName: string;
}): string {
  const item =
    params.itemNumber != null && params.itemNumber > 0
      ? String(params.itemNumber)
      : "0";
  const label = cleanSupplier(params.docLabel || "NF", 20);
  return `${item}- ${label} ${cleanDocNumber(params.fiscalDocNumber)}- ${cleanSupplier(params.supplierName)}.pdf`;
}

export function resolveFiscalDocumentNumber(
  extracted: FiscalExtracted | null | undefined,
  fiscalKind: "NF" | "RPA" | null,
): string {
  const resolved = resolveFiscalNumberFromExtracted(extracted, fiscalKind);
  if (resolved) return resolved;
  return "S/N";
}

export function resolvePaymentDocumentNumber(params: {
  proofExtracted?: ProofExtracted | null;
  fiscalExtracted?: FiscalExtracted | null;
}): string {
  const fromProof = String(
    params.proofExtracted?.paymentDocumentNumber || "",
  ).trim();
  if (fromProof) return fromProof;

  const payment = params.fiscalExtracted?.payment;
  const pixTail = payment?.pixKey?.replace(/\D/g, "").slice(-10);
  if (pixTail && pixTail.length >= 4) return pixTail;

  const accountTail = payment?.bankAccount?.replace(/\D/g, "").slice(-10);
  if (accountTail && accountTail.length >= 4) return accountTail;

  return "0";
}

export function resolvePaymentDate(params: {
  proofExtracted?: ProofExtracted | null;
  paidAt?: Date | null;
  expectedPayAt?: Date | null;
  fallback?: Date;
}): Date {
  const raw = params.proofExtracted?.paymentDate;
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const parsed = new Date(`${raw.slice(0, 10)}T12:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (params.paidAt && !Number.isNaN(params.paidAt.getTime())) {
    return params.paidAt;
  }
  if (params.expectedPayAt && !Number.isNaN(params.expectedPayAt.getTime())) {
    return params.expectedPayAt;
  }
  return params.fallback ?? new Date();
}

export function resolveIssueDate(params: {
  fiscalExtracted?: FiscalExtracted | null;
  paymentDate: Date;
}): Date {
  const raw = params.fiscalExtracted?.hiredAt;
  if (raw) {
    const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return params.paymentDate;
}

export function resolveSalicItemNumber(sortOrder: number | null | undefined): number | null {
  if (sortOrder == null || !Number.isFinite(sortOrder)) return null;
  return rubricItemNumber(sortOrder);
}

export function buildSalicUploadFilenameForRow(params: {
  sortOrder: number;
  supplierName: string;
  fiscalExtracted?: FiscalExtracted | null;
  fiscalKind?: "NF" | "RPA" | null;
  /** Sem NF/RPA: rótulo do documento de apoio (Fatura, Apolice…). */
  docLabel?: string | null;
  /** Sem NF/RPA: número do documento de apoio. */
  docNumber?: string | null;
}): string {
  return buildSalicUploadFilename({
    itemNumber: resolveSalicItemNumber(params.sortOrder),
    docLabel: params.fiscalKind ?? params.docLabel ?? "Comprovante",
    fiscalDocNumber: params.fiscalKind
      ? resolveFiscalDocumentNumber(params.fiscalExtracted, params.fiscalKind)
      : (params.docNumber ?? "S/N"),
    supplierName: params.supplierName,
  });
}
