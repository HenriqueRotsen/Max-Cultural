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
    workspaceId: params.workspaceId,
  });

  return { ...stored, contentHash };
}

/**
 * Detecta NF/RPA provavelmente duplicada (mesmo fornecedor + número + valor) em
 * todos os projetos do workspace: a mesma nota não pode entrar em dois PRONACs.
 */
export async function findFiscalDocumentDuplicate(params: {
  workspaceId: string;
  cnpj: string;
  nfNumber: string | null | undefined;
  grossAmount: number;
  excludeDocumentId?: string;
}): Promise<{ id: string; filename: string; planningProjectId: string | null } | null> {
  const nfNum = String(params.nfNumber || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!params.cnpj || !nfNum || !(params.grossAmount > 0)) return null;

  const docs = await prisma.planningDocument.findMany({
    where: {
      workspaceId: params.workspaceId,
      kind: { in: ["NF", "RPA"] },
      status: { in: ["REVIEW", "IMPORTED"] },
      grossAmount: { gte: params.grossAmount - 0.02, lte: params.grossAmount + 0.02 },
      ...(params.excludeDocumentId
        ? { id: { not: params.excludeDocumentId } }
        : {}),
    },
    select: {
      id: true,
      filename: true,
      grossAmount: true,
      extractedJson: true,
      planningProjectId: true,
    },
  });

  const targetDoc = params.cnpj.replace(/\D/g, "");
  for (const d of docs) {
    const ext = (d.extractedJson || {}) as {
      cnpj?: string | null;
      nfNumber?: string | null;
      invoiceNumber?: string | null;
    };
    const docCnpj = String(ext.cnpj || "").replace(/\D/g, "");
    const docNum = String(ext.nfNumber || ext.invoiceNumber || "")
      .replace(/\D/g, "")
      .replace(/^0+/, "");
    const gross = d.grossAmount != null ? Number(d.grossAmount) : 0;
    if (
      docCnpj === targetDoc &&
      docNum === nfNum &&
      Math.abs(gross - params.grossAmount) < 0.02
    ) {
      return { id: d.id, filename: d.filename, planningProjectId: d.planningProjectId };
    }
  }
  return null;
}

/** Mensagem do arquivo repetido, dizendo em qual projeto ele já está. */
export async function duplicateFileMessage(dup: DuplicateDocumentInfo): Promise<string> {
  const project = dup.planningProjectId
    ? await prisma.planningProject.findUnique({
        where: { id: dup.planningProjectId },
        select: { externalCode: true },
      })
    : null;
  const where = project ? ` no projeto ${project.externalCode}` : "";
  return `Este arquivo já foi enviado${where} (${dup.kind} · ${dup.filename}). O mesmo documento não pode ser usado duas vezes.`;
}
