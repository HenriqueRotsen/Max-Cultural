/**
 * Faixas etárias padrão do MAX Indicadores. Toda exibição de faixa etária
 * (análise, prestação de contas, relatórios) usa estes rótulos, nesta ordem.
 */
export const FAIXA_MENOS_12 = "Menos de 12 anos";
export const FAIXA_12_18 = "12 a 18 anos";
export const FAIXA_19_24 = "19 a 24 anos";
export const FAIXA_25_39 = "25 a 39 anos";
export const FAIXA_40_59 = "40 a 59 anos";
export const FAIXA_60_MAIS = "60+";
export const FAIXA_NAO_INFORMADO = "Não informado";

export const FAIXAS_ETARIAS = [
  FAIXA_MENOS_12,
  FAIXA_12_18,
  FAIXA_19_24,
  FAIXA_25_39,
  FAIXA_40_59,
  FAIXA_60_MAIS,
  FAIXA_NAO_INFORMADO,
] as const;

export function faixaEtaria(idade: number | null | undefined): string {
  if (idade == null || !Number.isFinite(idade) || idade <= 0) return FAIXA_NAO_INFORMADO;
  if (idade < 12) return FAIXA_MENOS_12;
  if (idade <= 18) return FAIXA_12_18;
  if (idade <= 24) return FAIXA_19_24;
  if (idade <= 39) return FAIXA_25_39;
  if (idade <= 59) return FAIXA_40_59;
  return FAIXA_60_MAIS;
}

/** Posição da faixa na ordem padrão (rótulos desconhecidos vão para o fim). */
export function ordemFaixaEtaria(label: string): number {
  const i = (FAIXAS_ETARIAS as readonly string[]).indexOf(label);
  return i === -1 ? FAIXAS_ETARIAS.length : i;
}
