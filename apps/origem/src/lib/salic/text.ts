/**
 * Normaliza textos vindos da API/crawler do SALIC.
 * Corrige traços Windows-1252 mal decodificados (U+0096/U+0097) e entidades HTML.
 */
export function sanitizeSalicText(value?: string | null): string | undefined {
  if (value == null) return undefined;
  const cleaned = value
    .replace(/\u0096/g, "–")
    .replace(/\u0097/g, "—")
    .replace(/\u0091/g, "‘")
    .replace(/\u0092/g, "’")
    .replace(/\u0093/g, "“")
    .replace(/\u0094/g, "”")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&amp;/g, "&")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}
