import { stripAccents } from "@/lib/normalize";
import { slugifyPart } from "@/lib/territorio-slug";

/**
 * Stem do nome do programa: remove anos, edições e pontuação.
 * Ex.: "Cultura na Praça — 2ª Edição 2025" → "cultura-na-praca"
 */
export function programaStem(nomeProjeto: unknown): string {
  let raw = stripAccents(String(nomeProjeto ?? "").toLowerCase());
  raw = raw
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b\d+\s*[ªa]?\s*edic(ao|ão)\b/gi, " ")
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
