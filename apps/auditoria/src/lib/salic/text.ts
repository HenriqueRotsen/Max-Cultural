/**
 * Normaliza textos vindos da API/crawler do SALIC.
 * Corrige traços Windows-1252 mal decodificados (U+0096/U+0097) e entidades HTML.
 */
export function sanitizeSalicText(value?: string | null): string | undefined {
  if (value == null) return undefined;
  // Remove tags até estabilizar (evita "<scr<script>ipt>" sobrar como tag).
  let stripped = value;
  let prev: string;
  do {
    prev = stripped;
    stripped = stripped.replace(/<[^>]*>/g, "");
  } while (stripped !== prev);
  const cleaned = stripped
    .replace(/[<>]/g, "")
    .replace(/\u0096/g, "–")
    .replace(/\u0097/g, "—")
    .replace(/\u0091/g, "‘")
    .replace(/\u0092/g, "’")
    .replace(/\u0093/g, "“")
    .replace(/\u0094/g, "”")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&nbsp;/gi, " ")
    // &amp; por último: "&amp;nbsp;" deve virar "&nbsp;" literal, não espaço.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}
