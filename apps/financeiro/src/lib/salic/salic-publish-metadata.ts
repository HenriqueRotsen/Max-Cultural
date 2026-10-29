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

function slugSupplier(value: string, max = 60): string {
  const s = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return (s || "FORNECEDOR").slice(0, max);
}

/** Nome do arquivo enviado ao SALIC: `{item} - {nf} - {fornecedor}.pdf` */
export function buildSalicUploadFilename(params: {
  itemNumber: number | null;
  fiscalDocNumber: string;
  supplierName: string;
}): string {
  const item =
    params.itemNumber != null && params.itemNumber > 0
      ? String(params.itemNumber)
      : "0";
  const nfId = params.fiscalDocNumber.trim() || "S-N";
  const supplier = slugSupplier(params.supplierName);
  return `${item} - ${nfId} - ${supplier}.pdf`;
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
}): string {
  return buildSalicUploadFilename({
    itemNumber: resolveSalicItemNumber(params.sortOrder),
    fiscalDocNumber: resolveFiscalDocumentNumber(
      params.fiscalExtracted,
      params.fiscalKind ?? null,
    ),
    supplierName: params.supplierName,
  });
}
