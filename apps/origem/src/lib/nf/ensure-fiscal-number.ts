import { prisma } from "@/lib/db";
import { extractNfFromBuffer, type ExtractedFiscalDoc } from "@/lib/nf/extract";
import {
  extractFiscalNumbersFromText,
  resolveFiscalNumberFromExtracted,
} from "@/lib/nf/fiscal-number";
import { readPlanningDocumentBytes } from "@/lib/nf/read-document-bytes";

/**
 * Garante fiscalNumber no extractedJson da NF/RPA.
 * Re-lê o PDF quando o documento foi importado antes da extração do número.
 */
export async function ensureFiscalDocumentNumber(fiscal: {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  extractedJson: unknown;
}): Promise<string | null> {
  const kind = fiscal.kind === "NF" || fiscal.kind === "RPA" ? fiscal.kind : null;
  if (!kind) return null;

  const current = (fiscal.extractedJson || {}) as ExtractedFiscalDoc;
  const existing = resolveFiscalNumberFromExtracted(current, kind);
  if (existing) return existing;

  const rawText = current.rawText;
  if (rawText) {
    const fromText = extractFiscalNumbersFromText(rawText, kind);
    if (fromText.fiscalNumber) {
      await persistFiscalNumbers(fiscal.id, current, fromText);
      return fromText.fiscalNumber;
    }
  }

  try {
    const buffer = await readPlanningDocumentBytes(fiscal.storagePath);
    const refreshed = await extractNfFromBuffer({
      buffer,
      filename: fiscal.filename,
      mimeType: fiscal.mimeType,
    });
    const fromRefresh = extractFiscalNumbersFromText(
      refreshed.rawText || "",
      refreshed.documentKind || kind,
    );
    const number =
      resolveFiscalNumberFromExtracted(refreshed, kind) || fromRefresh.fiscalNumber;
    if (number) {
      await persistFiscalNumbers(fiscal.id, { ...current, ...refreshed }, {
        fiscalNumber: number,
        nfseNumber: fromRefresh.nfseNumber ?? refreshed.nfseNumber ?? null,
        rpsNumber: fromRefresh.rpsNumber ?? refreshed.rpsNumber ?? null,
      });
      return number;
    }
  } catch {
    // mantém sem número
  }

  return null;
}

async function persistFiscalNumbers(
  documentId: string,
  current: ExtractedFiscalDoc,
  numbers: {
    fiscalNumber: string;
    nfseNumber?: string | null;
    rpsNumber?: string | null;
  },
): Promise<void> {
  await prisma.planningDocument.update({
    where: { id: documentId },
    data: {
      extractedJson: {
        ...current,
        fiscalNumber: numbers.fiscalNumber,
        nfseNumber: numbers.nfseNumber ?? current.nfseNumber ?? null,
        rpsNumber: numbers.rpsNumber ?? current.rpsNumber ?? null,
        nfNumber: numbers.fiscalNumber,
        invoiceNumber: numbers.fiscalNumber,
        fiscalNumberSource: "extracted",
      } as object,
    },
  });
}
