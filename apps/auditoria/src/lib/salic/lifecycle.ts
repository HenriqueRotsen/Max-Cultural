/** Ciclo de vida do projeto perante o SALIC (espelho da Auditoria). */
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

export function isDiligenciaSituacao(situacao?: string | null): boolean {
  const s = normalizeSituacao(situacao);
  if (!s) return false;
  return /diligenc/.test(s);
}
