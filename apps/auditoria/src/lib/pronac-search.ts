import { situacaoLabel } from "@/lib/salic/situacao-label";

/** Minúsculas e sem acento, para a busca casar "praca" com "Praça". */
export function normSearch(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Texto em que a busca "Buscar projeto" procura: PRONAC, projeto, proponente e situação. */
export function pronacSearchHay(row: {
  pronac: string;
  name?: string | null;
  accountName: string;
  situacao?: string | null;
}) {
  return normSearch(
    `${row.pronac} ${row.name || ""} ${row.accountName} ${situacaoLabel(row.situacao)?.label || ""} ${row.situacao || ""}`,
  );
}

/** Todas as palavras da busca precisam aparecer (ex.: "24" acha PRONACs com 24). */
export function matchesPronacSearch(hay: string, query: string | null | undefined) {
  const terms = normSearch(query || "").split(/\s+/).filter(Boolean);
  return terms.every((t) => hay.includes(t));
}
