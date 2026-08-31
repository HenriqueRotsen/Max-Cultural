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
    const alreadyPublished = Boolean(proof.salicComprovanteId);
    const wasProofOnly = proof.salicPublishMode === "PROOF_ONLY";
    const needsRepublish =
      proof.salicRepublishPending || (alreadyPublished && wasProofOnly && fiscal);

    if (needsRepublish && proof.salicComprovanteId) {
      packages.push({
        proofId: proof.id,
        proofFilename: proof.filename,
        fiscalId: fiscal?.id ?? null,
        fiscalFilename: fiscal?.filename ?? null,
        action: "REPUBLISH_MERGED",
        replaceSalicId: proof.salicComprovanteId,
        label: fiscal
          ? `Republicar NF/RPA + comprovante (${proof.filename})`
          : `Republicar comprovante (${proof.filename})`,
      });
      continue;
    }

    if (alreadyPublished && proof.salicPublishMode === "MERGED" && fiscal) {
      continue;
    }

    if (alreadyPublished && wasProofOnly && !fiscal) {
      continue;
    }

    if (fiscal) {
      packages.push({
        proofId: proof.id,
        proofFilename: proof.filename,
        fiscalId: fiscal.id,
        fiscalFilename: fiscal.filename,
        action: "UPLOAD_MERGED",
        replaceSalicId: null,
        label: `NF/RPA + comprovante (${fiscal.filename} + ${proof.filename})`,
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
        label: `Comprovante (${proof.filename})`,
      });
    }
  }

  return packages;
}

export function salicPublishPackageCount(docs: SalicPublishDoc[]): number {
  return buildSalicPublishPackages(docs).length;
}
