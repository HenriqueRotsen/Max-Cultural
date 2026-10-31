/** Situação do projeto no SALIC (atualizada todo dia no sync) em uma etiqueta simples. */

export type SituacaoTone = "ok" | "info" | "attention" | "critical" | "muted";

export type SituacaoLabel = {
  /** Categoria curta para a etiqueta, ex.: "Em diligência". */
  label: string;
  tone: SituacaoTone;
  /** Texto completo do SALIC sem o código, ex.: "Apresentou prestação de contas". */
  detail: string;
  /** Código do SALIC, ex.: "E24". */
  code: string | null;
};

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function situacaoLabel(situacao: string | null | undefined): SituacaoLabel | null {
  const raw = String(situacao || "").trim();
  if (!raw) return null;
  const m = raw.match(/^([A-Z]\d{2})\s*-\s*(.+)$/);
  const code = m ? m[1]! : null;
  const detail = (m ? m[2]! : raw).trim();
  const s = norm(detail);

  const pick = (label: string, tone: SituacaoTone): SituacaoLabel => ({ label, tone, detail, code });

  if (s.includes("arquivad") || s.includes("nao executado") || s.includes("cancelad")) {
    return pick("Arquivado", "muted");
  }
  if (s.includes("reprovad") || s.includes("nao aprovad") || s.includes("indeferid")) {
    return pick("Não aprovado", "critical");
  }
  if (s.includes("diligenc")) return pick("Em diligência", "attention");
  if (s.includes("prestacao de contas aprovada") || s.includes("contas aprovadas")) {
    return pick("Contas aprovadas", "ok");
  }
  if (
    s.includes("prestacao de contas") ||
    s.includes("analise financeira") ||
    s.includes("avaliacao de resultados")
  ) {
    return pick("Prestação de contas em análise", "info");
  }
  if (s.includes("captacao") && s.includes("autorizad")) return pick("Captação autorizada", "ok");
  if (s.includes("aprovad")) return pick("Aprovado", "ok");
  if (s.includes("analise") || s.includes("aguarda")) return pick("Em análise", "info");
  return pick("Em andamento", "info");
}

/** Classe de etiqueta (globals.css) para cada tom. */
export const SITUACAO_BADGE: Record<SituacaoTone, string> = {
  ok: "badge-success",
  info: "badge-info",
  attention: "badge-attention",
  critical: "badge-danger",
  muted: "badge-muted",
};
