import { prisma } from "@/lib/db";
import { storeCompressedDocument } from "@/lib/nf/compress";
import { hashDocumentContent } from "@/lib/nf/document-hash";

export type StoredPlanningUpload = {
  storagePath: string;
  byteSize: number;
  originalByteSize: number;
  contentHash: string;
};

export type PlanningDocumentKindFilter =
  | "NF"
  | "RPA"
  | "PAYMENT_PROOF"
  | "TAX_PROOF";

export type DuplicateCheckScope = {
  planningProjectId?: string;
  kinds?: PlanningDocumentKindFilter[];
};

export type DuplicateDocumentInfo = {
  id: string;
  kind: string;
  filename: string;
  planningProjectId: string | null;
  status: string;
};

export class DuplicateDocumentError extends Error {
  readonly duplicate: DuplicateDocumentInfo;

  constructor(duplicate: DuplicateDocumentInfo) {
    super(
      `DUPLICATE:Este arquivo já foi enviado (${duplicate.kind} · ${duplicate.filename}).`,
    );
    this.name = "DuplicateDocumentError";
    this.duplicate = duplicate;
  }
}

export async function persistPlanningUpload(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  workspaceId: string;
  /** true = workspace inteiro; objeto = escopo (ex.: só NF/RPA do projeto). */
  rejectDuplicate?: boolean | DuplicateCheckScope;
}): Promise<StoredPlanningUpload> {
  const contentHash = hashDocumentContent(params.buffer);

  if (params.rejectDuplicate) {
    const scope =
      params.rejectDuplicate === true ? {} : params.rejectDuplicate;
    const dup = await prisma.planningDocument.findFirst({
      where: {
        workspaceId: params.workspaceId,
        contentHash,
        ...(scope.planningProjectId
          ? { planningProjectId: scope.planningProjectId }
          : {}),
        ...(scope.kinds?.length ? { kind: { in: scope.kinds } } : {}),
      },
      select: {
        id: true,
        filename: true,
        kind: true,
        planningProjectId: true,
        status: true,
      },
    });
    if (dup) {
      throw new DuplicateDocumentError(dup);
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
