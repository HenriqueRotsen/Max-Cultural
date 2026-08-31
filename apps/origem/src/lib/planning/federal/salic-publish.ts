import { prisma } from "@/lib/db";
import { mergeDocumentsToPdf, type MergeSource } from "@/lib/nf/merge-pdf";
import {
  buildSalicPublishPackages,
  type SalicPublishDoc,
  type SalicPublishMode,
  type SalicPublishPackage,
} from "@/lib/planning/federal/salic-publish-packages";
import { isFederalPlanning } from "@/lib/planning/lifecycle";
import { ensureFiscalDocumentNumber } from "@/lib/nf/ensure-fiscal-number";
import {
  buildSalicUploadFilename,
  resolveFiscalDocumentNumber,
  resolveSalicItemNumber,
} from "@/lib/salic/salic-publish-metadata";
import {
  runSalicDeleteComprovante,
  runSalicPublishForProof,
} from "@/lib/salic/publish-robot";

export type SalicUploadResult = {
  salicComprovanteId: string;
};

/** Remove comprovante previamente enviado ao SALIC (pagamento antecipado). */
export async function deleteSalicComprovante(params: {
  planningProjectId: string;
  externalCode: string;
  salicComprovanteId: string;
}): Promise<void> {
  await runSalicDeleteComprovante(params);
}

/** Envia PDF ao SALIC e retorna id_comprovante_pagamento. */
export async function uploadSalicComprovante(params: {
  planningProjectId: string;
  externalCode: string;
  proofId: string;
  mergedStoragePath: string;
  filename: string;
  replaceSalicId?: string | null;
  justificativa?: string;
}): Promise<SalicUploadResult> {
  return runSalicPublishForProof({
    planningProjectId: params.planningProjectId,
    externalCode: params.externalCode,
    proofId: params.proofId,
    mergedStoragePath: params.mergedStoragePath,
    filename: params.filename,
    replaceSalicId: params.replaceSalicId,
    justificativa: params.justificativa,
  });
}

async function loadDoc(proofId: string, fiscalId: string | null) {
  const ids = [proofId, fiscalId].filter(Boolean) as string[];
  const rows = await prisma.planningDocument.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      kind: true,
      status: true,
      filename: true,
      mimeType: true,
      storagePath: true,
      byteSize: true,
    },
  });
  const proof = rows.find((r) => r.id === proofId);
  if (!proof) throw new Error("Comprovante não encontrado.");
  const fiscal = fiscalId ? rows.find((r) => r.id === fiscalId) : null;
  return { proof, fiscal };
}

async function resolveSalicUploadFilename(
  proofId: string,
  supplierName: string,
): Promise<string> {
  const proof = await prisma.planningDocument.findUniqueOrThrow({
    where: { id: proofId },
    select: {
      sourceDocument: {
        select: {
          id: true,
          kind: true,
          filename: true,
          mimeType: true,
          storagePath: true,
          extractedJson: true,
        },
      },
      allocations: {
        include: { budgetLine: { select: { sortOrder: true } } },
        orderBy: { amount: "desc" },
        take: 1,
      },
    },
  });

  const fiscal = proof.sourceDocument;
  const fiscalKind =
    fiscal?.kind === "NF" || fiscal?.kind === "RPA" ? fiscal.kind : null;

  let fiscalExtracted = (fiscal?.extractedJson || {}) as {
    nfNumber?: string | null;
    invoiceNumber?: string | null;
  };
  if (fiscal && resolveFiscalDocumentNumber(fiscalExtracted, fiscalKind) === "S/N") {
    const ensured = await ensureFiscalDocumentNumber(fiscal);
    if (ensured) {
      fiscalExtracted = { ...fiscalExtracted, nfNumber: ensured, invoiceNumber: ensured };
    }
  }

  const fiscalDocNumber = resolveFiscalDocumentNumber(fiscalExtracted, fiscalKind);
  const itemNumber = resolveSalicItemNumber(
    proof.allocations[0]?.budgetLine.sortOrder,
  );

  return buildSalicUploadFilename({
    itemNumber,
    fiscalDocNumber,
    supplierName,
  });
}

function toMergeSource(row: {
  storagePath: string;
  mimeType: string;
  filename: string;
}): MergeSource {
  return {
    storagePath: row.storagePath,
    mimeType: row.mimeType,
    filename: row.filename,
  };
}

export async function prepareSalicPackageFile(
  pkg: SalicPublishPackage,
  externalCode: string,
): Promise<{ storagePath: string; byteSize: number; mode: SalicPublishMode }> {
  const { proof, fiscal } = await loadDoc(pkg.proofId, pkg.fiscalId);

  if (fiscal) {
    const merged = await mergeDocumentsToPdf(
      [toMergeSource(fiscal), toMergeSource(proof)],
      `SALIC_${externalCode}_NF-COMPROVANTE`,
    );
    return { storagePath: merged.storagePath, byteSize: merged.byteSize, mode: "MERGED" };
  }

  const { isPdfDocument } = await import("@/lib/nf/read-document-bytes");
  if (isPdfDocument(proof.mimeType, proof.filename, proof.storagePath)) {
    return {
      storagePath: proof.storagePath,
      byteSize: proof.byteSize,
      mode: "PROOF_ONLY",
    };
  }

  const converted = await mergeDocumentsToPdf(
    [toMergeSource(proof)],
    `SALIC_${externalCode}_COMPROVANTE`,
  );
  return {
    storagePath: converted.storagePath,
    byteSize: converted.byteSize,
    mode: "PROOF_ONLY",
  };
}

export async function executeSalicPublishPackage(params: {
  planningProjectId: string;
  externalCode: string;
  pkg: SalicPublishPackage;
  justificativa?: string;
}): Promise<void> {
  const { planningProjectId, externalCode, pkg, justificativa } = params;

  const project = await prisma.planningProject.findUnique({
    where: { id: planningProjectId },
    select: { jurisdiction: true },
  });
  if (!project || !isFederalPlanning(project.jurisdiction)) {
    throw new Error("Envio ao SALIC disponível só para projetos federais (Lei Rouanet).");
  }

  const prepared = await prepareSalicPackageFile(pkg, externalCode);

  const commitment = await prisma.planningDocument.findUnique({
    where: { id: pkg.proofId },
    select: {
      commitment: {
        select: {
          engagement: {
            select: { service: { select: { supplier: { select: { name: true } } } } },
          },
        },
      },
      engagement: {
        select: {
          service: { select: { supplier: { select: { name: true } } } },
        },
      },
    },
  });
  const supplierName =
    commitment?.commitment?.engagement.service.supplier.name ??
    commitment?.engagement?.service.supplier.name ??
    "Fornecedor";
  const uploadName = await resolveSalicUploadFilename(pkg.proofId, supplierName);

  const uploaded = await uploadSalicComprovante({
    planningProjectId,
    externalCode,
    proofId: pkg.proofId,
    mergedStoragePath: prepared.storagePath,
    filename: uploadName,
    replaceSalicId: pkg.replaceSalicId,
    justificativa,
  });

  await prisma.planningDocument.update({
    where: { id: pkg.proofId },
    data: {
      salicComprovanteId: uploaded.salicComprovanteId,
      salicPublishedAt: new Date(),
      salicPublishMode: prepared.mode,
      salicMergedStoragePath:
        prepared.mode === "MERGED" ? prepared.storagePath : null,
      salicRepublishPending: false,
    },
  });

  const { linkPlanningEngagementsToAuditPayments } = await import(
    "@/lib/planning/federal/audit-reconcile"
  );
  await linkPlanningEngagementsToAuditPayments(planningProjectId);
}

export async function markSalicRepublishAfterNfAttach(proofId: string): Promise<boolean> {
  const proof = await prisma.planningDocument.findUnique({
    where: { id: proofId },
    select: {
      salicComprovanteId: true,
      salicPublishMode: true,
    },
  });
  if (!proof?.salicComprovanteId || proof.salicPublishMode !== "PROOF_ONLY") {
    return false;
  }

  await prisma.planningDocument.update({
    where: { id: proofId },
    data: { salicRepublishPending: true },
  });
  return true;
}

export type { SalicPublishDoc, SalicPublishPackage };
export { buildSalicPublishPackages };

const SALIC_DOC_SELECT = {
  id: true,
  kind: true,
  status: true,
  filename: true,
  mimeType: true,
  storagePath: true,
  sourceDocumentId: true,
  salicComprovanteId: true,
  salicPublishMode: true,
  salicRepublishPending: true,
} as const;

export async function loadSalicPublishDocs(planningProjectId: string) {
  return prisma.planningDocument.findMany({
    where: { planningProjectId, status: "IMPORTED" },
    orderBy: { createdAt: "asc" },
    select: SALIC_DOC_SELECT,
  });
}

export async function publishSalicPackages(params: {
  planningProjectId: string;
  externalCode: string;
  proofIds?: string[];
  justificativasByProofId?: Record<string, string>;
}): Promise<{ published: number; errors: string[] }> {
  const docs = await loadSalicPublishDocs(params.planningProjectId);
  let packages = buildSalicPublishPackages(docs);
  if (params.proofIds?.length) {
    const allowed = new Set(params.proofIds);
    packages = packages.filter((p) => allowed.has(p.proofId));
  }

  let published = 0;
  const errors: string[] = [];

  for (const pkg of packages) {
    try {
      await executeSalicPublishPackage({
        planningProjectId: params.planningProjectId,
        externalCode: params.externalCode,
        pkg,
        justificativa: params.justificativasByProofId?.[pkg.proofId],
      });
      published += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no envio";
      errors.push(`${pkg.label}: ${msg}`);
    }
  }

  if (packages.length === 0 && params.proofIds?.length) {
    errors.push("Nenhum pacote pronto para envio (comprovante + NF importados?).");
  }

  return { published, errors };
}

export async function getSalicPackagePreviewBytes(
  planningProjectId: string,
  proofId: string,
): Promise<{ body: Buffer; filename: string; mode: SalicPublishMode; label: string }> {
  const project = await prisma.planningProject.findUniqueOrThrow({
    where: { id: planningProjectId },
    select: { externalCode: true, jurisdiction: true },
  });
  if (!isFederalPlanning(project.jurisdiction)) {
    throw new Error("Preview SALIC disponível só para projetos federais.");
  }

  const docs = await loadSalicPublishDocs(planningProjectId);
  const pkg = buildSalicPublishPackages(docs).find((p) => p.proofId === proofId);
  if (!pkg) {
    throw new Error("Pacote não está pronto para envio ao SALIC.");
  }

  const prepared = await prepareSalicPackageFile(pkg, project.externalCode);
  const { readFile } = await import("fs/promises");
  const body = await readFile(prepared.storagePath);

  const commitment = await prisma.planningDocument.findUnique({
    where: { id: proofId },
    select: {
      commitment: {
        select: {
          engagement: {
            select: { service: { select: { supplier: { select: { name: true } } } } },
          },
        },
      },
      engagement: {
        select: {
          service: { select: { supplier: { select: { name: true } } } },
        },
      },
    },
  });
  const supplierName =
    commitment?.commitment?.engagement.service.supplier.name ??
    commitment?.engagement?.service.supplier.name ??
    "Fornecedor";
  const filename = await resolveSalicUploadFilename(proofId, supplierName);

  return { body, filename, mode: prepared.mode, label: pkg.label };
}
