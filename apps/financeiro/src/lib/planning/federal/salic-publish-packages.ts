/** Como o comprovante foi (ou será) enviado ao SALIC. */
export type SalicPublishMode = "PROOF_ONLY" | "MERGED";

export type SalicPublishDoc = {
  id: string;
  kind: string;
  status: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  sourceDocumentId: string | null;
  salicComprovanteId: string | null;
  salicPublishMode: string | null;
  salicRepublishPending: boolean;
  /** Lançamento do documento (documentos de apoio ficam no lançamento). */
  commitmentId?: string | null;
  /** SUPPORT: BOLETO, FATURA, RECIBO, CONTRATO, APOLICE, ORCAMENTO. */
  supportType?: string | null;
  /** Comprovante: lançamentos do rateio. */
  allocations?: Array<{ commitmentId: string }>;
};

export type SalicPublishPackageAction =
  | "UPLOAD_PROOF_ONLY"
  | "UPLOAD_MERGED"
  | "REPUBLISH_MERGED";

export type SalicPublishPackage = {
  /** Comprovante de pagamento (âncora do pacote). */
  proofId: string;
  proofFilename: string;
  /** NF/RPA vinculada, quando existir. */
  fiscalId: string | null;
  fiscalFilename: string | null;
  action: SalicPublishPackageAction;
  /** id_comprovante_pagamento no SALIC a remover antes de republicar. */
  replaceSalicId: string | null;
  label: string;
  /** Documentos de apoio do pagamento (contrato, apólice, boleto…), na ordem do PDF. */
  supportIds: string[];
};

function isFiscal(kind: string) {
  return kind === "NF" || kind === "RPA";
}

function fiscalForProof(
  proof: SalicPublishDoc,
  byId: Map<string, SalicPublishDoc>,
): SalicPublishDoc | null {
  if (!proof.sourceDocumentId) return null;
  const fiscal = byId.get(proof.sourceDocumentId);
  if (!fiscal || !isFiscal(fiscal.kind) || fiscal.status !== "IMPORTED") return null;
  return fiscal;
}

const SUPPORT_ORDER = ["CONTRATO", "APOLICE", "FATURA", "ORCAMENTO", "BOLETO", "RECIBO"];

/** Documentos de apoio dos lançamentos deste comprovante (inclui o rateio). */
function supportsForProof(proof: SalicPublishDoc, docs: SalicPublishDoc[]): SalicPublishDoc[] {
  const group = new Set<string>(
    [proof.commitmentId, ...(proof.allocations ?? []).map((a) => a.commitmentId)].filter(
      (x): x is string => Boolean(x),
    ),
  );
  if (group.size === 0) return [];
  const rank = (t?: string | null) => {
    const i = SUPPORT_ORDER.indexOf(t ?? "");
    return i < 0 ? SUPPORT_ORDER.length : i;
  };
  return docs
    .filter((d) => d.kind === "SUPPORT" && d.status === "IMPORTED" && d.commitmentId && group.has(d.commitmentId))
    .sort((a, b) => rank(a.supportType) - rank(b.supportType));
}

/**
 * Monta a fila de envio ao SALIC.
 * Cada item = 1 comprovante (sozinho ou merged com NF/RPA).
 * NF/RPA nunca sobe separada quando há comprovante vinculado.
 */
export function buildSalicPublishPackages(docs: SalicPublishDoc[]): SalicPublishPackage[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const packages: SalicPublishPackage[] = [];

  for (const proof of docs) {
    if (proof.kind !== "PAYMENT_PROOF" || proof.status !== "IMPORTED") continue;

    const fiscal = fiscalForProof(proof, byId);
    const supports = supportsForProof(proof, docs);
    const supportIds = supports.map((d) => d.id);
    const supportNames = supports.map((d) => d.filename);
    const hasExtra = Boolean(fiscal) || supports.length > 0;
    const alreadyPublished = Boolean(proof.salicComprovanteId);
    const wasProofOnly = proof.salicPublishMode === "PROOF_ONLY";
    const needsRepublish =
      proof.salicRepublishPending || (alreadyPublished && wasProofOnly && hasExtra);
    const mergedLabel = [fiscal?.filename, ...supportNames, proof.filename]
      .filter(Boolean)
      .join(" + ");

    if (needsRepublish && proof.salicComprovanteId) {
      packages.push({
        proofId: proof.id,
        proofFilename: proof.filename,
        fiscalId: fiscal?.id ?? null,
        fiscalFilename: fiscal?.filename ?? null,
        action: "REPUBLISH_MERGED",
        replaceSalicId: proof.salicComprovanteId,
        supportIds,
        label: fiscal
          ? supports.length
            ? `Republicar NF/RPA + documentos + comprovante (${proof.filename})`
            : `Republicar NF/RPA + comprovante (${proof.filename})`
          : supports.length
            ? `Republicar documentos + comprovante (${proof.filename})`
            : `Republicar comprovante (${proof.filename})`,
      });
      continue;
    }

    if (alreadyPublished && proof.salicPublishMode === "MERGED" && hasExtra) {
      continue;
    }

    if (alreadyPublished && wasProofOnly && !hasExtra) {
      continue;
    }

    if (hasExtra) {
      packages.push({
        proofId: proof.id,
        proofFilename: proof.filename,
        fiscalId: fiscal?.id ?? null,
        fiscalFilename: fiscal?.filename ?? null,
        action: "UPLOAD_MERGED",
        replaceSalicId: null,
        supportIds,
        label: fiscal && !supports.length
          ? `NF/RPA + comprovante (${fiscal.filename} + ${proof.filename})`
          : `${fiscal ? "NF/RPA + " : ""}documentos + comprovante (${mergedLabel})`,
      });
      continue;
    }

    if (!alreadyPublished) {
      packages.push({
        proofId: proof.id,
        proofFilename: proof.filename,
        fiscalId: null,
        fiscalFilename: null,
        action: "UPLOAD_PROOF_ONLY",
        replaceSalicId: null,
        supportIds: [],
        label: `Comprovante (${proof.filename})`,
      });
    }
  }

  return packages;
}

export function salicPublishPackageCount(docs: SalicPublishDoc[]): number {
  return buildSalicPublishPackages(docs).length;
}

/** Campos que a fila de envio ao SALIC precisa (consulta do Prisma). */
export const SALIC_DOC_SELECT = {
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
  commitmentId: true,
  supportType: true,
  allocations: { select: { commitmentId: true } },
} as const;
