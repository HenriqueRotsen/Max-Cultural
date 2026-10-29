import path from "path";

function slugPart(value: string, max = 40): string {
  const s = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return (s || "DOC").slice(0, max);
}

function moneyPart(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  return `R${amount.toFixed(2).replace(".", "-")}`;
}

function extFromName(originalFilename: string, mimeType?: string | null): string {
  const fromName = path.extname(originalFilename || "").toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (mimeType?.includes("pdf")) return ".pdf";
  if (mimeType?.includes("xml")) return ".xml";
  if (mimeType?.startsWith("image/")) {
    if (mimeType.includes("png")) return ".png";
    if (mimeType.includes("webp")) return ".webp";
    return ".jpg";
  }
  return ".bin";
}

/**
 * Nome legível para NF/RPA/comprovante no banco e no disco.
 * Ex.: NF_203216_66268938000103_HENRIQUE-ROTSEN_2026-07-07_R600-00.pdf
 */
export function buildPlanningDocumentFilename(params: {
  kind: "NF" | "RPA" | "PAYMENT_PROOF" | "TAX_PROOF";
  projectCode: string;
  supplierName?: string | null;
  supplierDoc?: string | null;
  hiredAt?: string | null;
  amount?: number | null;
  originalFilename: string;
  mimeType?: string | null;
}): string {
  const kindLabel =
    params.kind === "PAYMENT_PROOF"
      ? "COMPROVANTE"
      : params.kind === "TAX_PROOF"
        ? "COMPROVANTE-FISCAL"
        : params.kind;

  const digits = String(params.supplierDoc || "").replace(/\D/g, "");
  const date =
    params.hiredAt && /^\d{4}-\d{2}-\d{2}/.test(params.hiredAt)
      ? params.hiredAt.slice(0, 10)
      : null;

  const parts = [
    kindLabel,
    slugPart(params.projectCode, 24),
    digits ? digits.slice(0, 14) : null,
    params.supplierName ? slugPart(params.supplierName, 36) : null,
    date,
    moneyPart(params.amount),
  ].filter(Boolean);

  const ext = extFromName(params.originalFilename, params.mimeType);
  return `${parts.join("_")}${ext}`;
}
