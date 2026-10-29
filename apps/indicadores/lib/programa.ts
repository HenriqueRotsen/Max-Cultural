import { stripAccents } from "@/lib/normalize";
import { slugifyPart } from "@/lib/territorio-slug";

/** Remove trechos entre (), [] ou {} (várias passadas para aninhamento simples). */
function stripBracketGroups(raw: string): string {
  let s = raw;
  for (let i = 0; i < 6; i++) {
    const next = s
      .replace(/\([^()]*\)/g, " ")
      .replace(/\[[^\[\]]*\]/g, " ")
      .replace(/\{[^{}]*\}/g, " ");
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Mantém só o trecho antes do primeiro hífen ( -, – ou — ). */
function stripAfterHyphen(raw: string): string {
  const idx = raw.search(/[-–—]/);
  if (idx === -1) return raw;
  return raw.slice(0, idx);
}

/**
 * Stem do nome do programa: ignora parênteses/colchetes/chaves, corta no hífen,
 * remove anos e marcadores de edição.
 * Ex.: "Arte em cores - 3ª edição (modo virtual)" → "arte-em-cores"
 */
export function programaStem(nomeProjeto: unknown): string {
  let raw = stripAccents(String(nomeProjeto ?? "").toLowerCase());
  raw = stripBracketGroups(raw);
  raw = stripAfterHyphen(raw);
  raw = raw
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b\d+\s*[ªa]?\s*edic(ao|ão)?\b/gi, " ")
    .replace(/\bedic(ao|ão)\s*\d+\b/gi, " ")
    .replace(/\b(ed\.?|edicao|edição)\b/gi, " ")
    .replace(/\b(i{1,3}|iv|v|vi{0,3}|ix|x)\b/gi, " ")
    .replace(/[–—\-_|/]+/g, " ")
    .replace(/\s+\d+\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return slugifyPart(raw);
}

export function programaDisplayName(nomeProjeto: unknown): string {
  const stem = programaStem(nomeProjeto);
  if (!stem) return String(nomeProjeto ?? "").trim() || "Programa";
  return stem
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Número da edição no nome do projeto (ex.: "… 3ª edição" → 3).
 * Retorna null quando não há marcador explícito.
 */
export function extractEdicaoNumero(nomeProjeto: unknown): number | null {
  let raw = stripAccents(String(nomeProjeto ?? "").toLowerCase());
  raw = stripBracketGroups(raw);

  const beforeHyphen = stripAfterHyphen(raw);
  const afterHyphen =
    raw.length > beforeHyphen.length
      ? raw.slice(beforeHyphen.length).replace(/^[-–—\s]+/, "")
      : "";

  for (const part of [afterHyphen, beforeHyphen, raw]) {
    const m1 = part.match(/\b(\d+)\s*[ªaº°.]?\s*edic(?:ao|ão)?\b/);
    if (m1) return parseInt(m1[1]!, 10);

    const m2 = part.match(/\bedic(?:ao|ão)\s*[º°.]?\s*(\d+)\b/);
    if (m2) return parseInt(m2[1]!, 10);
  }

  const trailing = beforeHyphen.trim().match(/\s(\d+)\s*$/);
  if (trailing) return parseInt(trailing[1]!, 10);

  return null;
}

/** Ordenação de edições na linha do tempo: número da edição, ano, nome. */
export function compareProjetoEdicao(
  a: { nome: string; ano?: string | null },
  b: { nome: string; ano?: string | null },
): number {
  const na = extractEdicaoNumero(a.nome);
  const nb = extractEdicaoNumero(b.nome);
  const va = na ?? 0;
  const vb = nb ?? 0;
  if (va !== vb) return va - vb;

  const yearFrom = (p: { nome: string; ano?: string | null }) => {
    const y = String(p.ano ?? "").trim();
    if (/^(19|20)\d{2}$/.test(y)) return y;
    const fromName = p.nome.match(/\b((?:19|20)\d{2})\b/);
    return fromName?.[1] ?? "";
  };
  const ya = yearFrom(a);
  const yb = yearFrom(b);
  if (ya !== yb) return ya.localeCompare(yb);

  return a.nome.localeCompare(b.nome, "pt-BR");
}
