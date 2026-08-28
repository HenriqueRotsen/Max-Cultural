/** Ciclo de vida do projeto perante o SALIC / planejamento. */
export type ProjectLifecycle = "EM_ANDAMENTO" | "ENCERRADO";

export function normalizeSituacao(situacao?: string | null): string {
  return String(situacao || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Classifica a situação textual do SALIC.
 * Sem situação conhecida, assume em andamento (segura para listagem).
 */
export function classifyLifecycleFromSituacao(
  situacao?: string | null,
): ProjectLifecycle {
  const s = normalizeSituacao(situacao);
  if (!s) return "EM_ANDAMENTO";

  if (
    /(encerr|arquiv|cancelad|indefer|inabilit|reprovad|extint|desistenc)/.test(s)
  ) {
    return "ENCERRADO";
  }

  if (
    /prestacao de contas/.test(s) &&
    /(aprovad|conclu|finaliz|homolog)/.test(s)
  ) {
    return "ENCERRADO";
  }

  return "EM_ANDAMENTO";
}

export function lifecycleLabel(status: string | null | undefined): string {
  return status === "ENCERRADO" ? "Encerrado" : "Em andamento";
}

export function jurisdictionLabel(jurisdiction: string | null | undefined): string {
  if (!jurisdiction) return "—";
  if (jurisdiction === "FEDERAL") return "Federal";
  return jurisdiction;
}

export function importSourceLabel(source: string | null | undefined): string {
  if (source === "SALIC_HOMOLOGADA") return "Planilha do SALIC";
  if (source === "SALIC_READEQUADA") return "Readequação do SALIC";
  if (source === "STATE_FILE") return "Arquivo estadual";
  return "Sem planilha";
}

export function commitmentStatusLabel(status: string): string {
  if (status === "RESERVED") return "Reservado";
  if (status === "PAID") return "Pago";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

export function nfPendingBadge(): string {
  return "NF pendente";
}

export type PublishReadiness = { ok: boolean; reasons: string[] };

export function assessSalicPublishReadiness(input: {
  hasSheet: boolean;
  documents: Array<{ kind: string; status: string }>;
  commitments: Array<{ status: string }>;
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

  const nfsOk = docs.filter(
    (d) => (d.kind === "NF" || d.kind === "RPA") && d.status === "IMPORTED",
  );
  if (nfsOk.length === 0) {
    reasons.push("Inclua ao menos uma NF ou RPA revisada e reservada.");
  }

  if (input.commitments.some((c) => c.status === "RESERVED")) {
    reasons.push(
      "Há reservas sem comprovante de pagamento. Envie os comprovantes ou cancele as reservas.",
    );
  }

  if (
    input.commitments.filter((c) => c.status === "PAID").length === 0 &&
    nfsOk.length > 0
  ) {
    reasons.push("Inclua comprovantes de pagamento das reservas.");
  }

  return { ok: reasons.length === 0, reasons };
}
