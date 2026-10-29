export type PublishReadiness = { ok: boolean; reasons: string[] };

/** Pré-requisitos para envio de NF/comprovantes à área logada do SALIC. */
export function assessSalicPublishReadiness(input: {
  hasSheet: boolean;
  documents: Array<{ kind: string; status: string }>;
  commitments: Array<{ status: string; nfPending?: boolean }>;
}): PublishReadiness {
  const reasons: string[] = [];

  if (!input.hasSheet) {
    reasons.push("Importe a planilha homologada antes de enviar ao SALIC.");
  }

  const docs = input.documents;
  if (docs.some((d) => d.status === "PROCESSING")) {
    reasons.push("Há documentos ainda sendo processados.");
  }
  if (docs.some((d) => d.status === "REVIEW")) {
    reasons.push("Há notas fiscais aguardando revisão.");
  }
  if (docs.some((d) => d.status === "FAILED")) {
    reasons.push("Há documentos com falha — corrija ou remova antes de enviar.");
  }

  const proofsOk = docs.filter(
    (d) => d.kind === "PAYMENT_PROOF" && d.status === "IMPORTED",
  );
  const nfsOk = docs.filter(
    (d) => (d.kind === "NF" || d.kind === "RPA") && d.status === "IMPORTED",
  );

  if (proofsOk.length === 0 && nfsOk.length === 0) {
    reasons.push(
      "Inclua ao menos um comprovante de pagamento ou NF/RPA para enviar ao SALIC.",
    );
  }

  if (input.commitments.some((c) => c.status === "RESERVED")) {
    reasons.push(
      "Há reservas sem comprovante de pagamento. Envie os comprovantes ou cancele as reservas.",
    );
  }

  const paidWithoutProof = input.commitments.filter(
    (c) => c.status === "PAID" && !c.nfPending,
  );
  if (paidWithoutProof.length > 0 && proofsOk.length === 0) {
    reasons.push("Inclua comprovantes de pagamento das reservas pagas.");
  }

  return { ok: reasons.length === 0, reasons };
}
