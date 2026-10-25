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

/**
 * Projeto ativo em diligência (ex.: "E37 - Diligência", "E30 - Análise de resposta de
 * diligência"). Situações de encerramento que só citam diligência ("A42 - Arquivado -
 * não atendimento à diligência técnica") não contam.
 */
export function isDiligenciaSituacao(situacao?: string | null): boolean {
  const s = normalizeSituacao(situacao);
  if (!s || !/diligenc/.test(s)) return false;
  return classifyLifecycleFromSituacao(situacao) !== "ENCERRADO";
}
