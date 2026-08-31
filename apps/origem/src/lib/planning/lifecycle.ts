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

/** Lei Rouanet / SALIC — distinto de projetos estaduais (planilha por arquivo). */
export function isFederalPlanning(jurisdiction: string | null | undefined): boolean {
  return jurisdiction === "FEDERAL";
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

export type { PublishReadiness } from "@/lib/planning/federal/salic-readiness";
export { assessSalicPublishReadiness } from "@/lib/planning/federal/salic-readiness";
