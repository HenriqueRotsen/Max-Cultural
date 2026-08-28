import { prisma } from "@/lib/db";
import { storeCompressedDocument } from "@/lib/nf/compress";
import { hashDocumentContent } from "@/lib/nf/document-hash";

export type StoredPlanningUpload = {
  storagePath: string;
  byteSize: number;
  originalByteSize: number;
  contentHash: string;
};

export async function persistPlanningUpload(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  workspaceId: string;
  /** Se true, bloqueia upload idêntico no workspace. */
  rejectDuplicate?: boolean;
}): Promise<StoredPlanningUpload> {
  const contentHash = hashDocumentContent(params.buffer);

  if (params.rejectDuplicate) {
    const dup = await prisma.planningDocument.findFirst({
      where: {
        workspaceId: params.workspaceId,
        contentHash,
      },
      select: { id: true, filename: true, kind: true },
    });
    if (dup) {
      throw new Error(
        `DUPLICATE:Este arquivo já foi enviado (${dup.kind} · ${dup.filename}).`,
      );
    }
  }

  const stored = await storeCompressedDocument({
    buffer: params.buffer,
    filename: params.filename,
    mimeType: params.mimeType,
  });

  return { ...stored, contentHash };
}

/** Detecta NF/RPA provavelmente duplicada (mesmo fornecedor + número + valor). */
export async function findFiscalDocumentDuplicate(params: {
  workspaceId: string;
  planningProjectId: string;
  cnpj: string;
  nfNumber: string | null | undefined;
  grossAmount: number;
  excludeDocumentId?: string;
}): Promise<{ id: string; filename: string } | null> {
  const nfNum = String(params.nfNumber || "").replace(/\D/g, "");
  if (!params.cnpj || !nfNum || !(params.grossAmount > 0)) return null;

  const docs = await prisma.planningDocument.findMany({
    where: {
      workspaceId: params.workspaceId,
      planningProjectId: params.planningProjectId,
      kind: { in: ["NF", "RPA"] },
      status: { in: ["REVIEW", "IMPORTED"] },
      ...(params.excludeDocumentId
        ? { id: { not: params.excludeDocumentId } }
        : {}),
    },
    select: {
      id: true,
      filename: true,
      grossAmount: true,
      extractedJson: true,
    },
    take: 200,
  });

  const targetDoc = params.cnpj.replace(/\D/g, "");
  for (const d of docs) {
    const ext = (d.extractedJson || {}) as {
      cnpj?: string | null;
      nfNumber?: string | null;
      invoiceNumber?: string | null;
    };
    const docCnpj = String(ext.cnpj || "").replace(/\D/g, "");
    const docNum = String(ext.nfNumber || ext.invoiceNumber || "").replace(
      /\D/g,
      "",
    );
    const gross = d.grossAmount != null ? Number(d.grossAmount) : 0;
    if (
      docCnpj === targetDoc &&
      docNum === nfNum &&
      Math.abs(gross - params.grossAmount) < 0.02
    ) {
      return { id: d.id, filename: d.filename };
    }
  }
  return null;
}
