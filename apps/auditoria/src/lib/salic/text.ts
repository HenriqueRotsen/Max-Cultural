/** Windows-1252 nas posições 0x80–0x9F (o SALIC manda cp1252 que chega lido como Latin-1). */
const CP1252_C1: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘",
  0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜",
  0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Desfaz texto UTF-8 lido como Latin-1 (às vezes duas vezes: "2ª" → "Âª" → "Ã\u0082Âª")
 * e troca os caracteres de controle 0x80–0x9F pelo equivalente Windows-1252
 * ("PRAÇA \u0096 3ª" → "PRAÇA – 3ª"). Só reinterpreta quando o resultado é UTF-8 válido.
 */
export function fixSalicEncoding(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    if (!/[\u00c2-\u00f4][\u0080-\u00bf]/.test(current) || /[^\u0000-\u00ff]/.test(current)) break;
    try {
      const decoded = utf8.decode(Uint8Array.from(current, (c) => c.charCodeAt(0)));
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current.replace(/[\u0080-\u009f]/g, (c) => CP1252_C1[c.charCodeAt(0)] ?? "");
}

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
  const cleaned = fixSalicEncoding(stripped)
    .replace(/[<>]/g, "")
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
