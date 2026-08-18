/**
 * Detecção de "endereço completo" (Google Forms etc.).
 * A divisão em campos é feita por IA (ver expandFullAddressesWithAi).
 */

const UF_SET = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

/** Cabeçalho típico de "endereço completo". */
export function isFullAddressHeader(source: string): boolean {
  const key = source
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[?!:;,()[\]{}"'`´]/g, " ")
    .replace(/[\s./\\+-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (/endereco_completo/.test(key)) return true;
  if (/endereco_residencial|endereco_com_cep|full_?address/.test(key)) return true;
  if (/endereco/.test(key) && /bairro/.test(key) && /(cidade|cep)/.test(key)) {
    return true;
  }
  if (/endereco/.test(key) && /rua/.test(key) && /numero/.test(key)) {
    return true;
  }
  return false;
}

/** Texto que ainda parece endereço completo (candidato à divisão por IA). */
export function looksLikeFullAddress(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (raw.length < 10) return false;
  if (/\bcep\b/i.test(raw)) return true;
  if (/\d{5}-?\d{3}/.test(raw)) return true;
  if (
    new RegExp(
      String.raw`(?:^|[\s,/\-–])(${[...UF_SET].join("|")})(?:$|[\s,;])`,
      "i",
    ).test(raw)
  ) {
    return true;
  }
  const commas = (raw.match(/[,;]/g) ?? []).length;
  if (commas >= 2) return true;
  if (commas >= 1 && /\d/.test(raw)) return true;
  if (
    /\b(rua|av\.?|avenida|travessa|alameda|pra[cç]a)\b/i.test(raw) &&
    /\d/.test(raw) &&
    raw.length >= 18
  ) {
    return true;
  }
  return false;
}

/** Precisa da IA para desmembrar (ainda está “tudo numa string”). */
export function needsAiAddressSplit(row: {
  Lougradouro?: string;
  Numero?: string;
  Bairro?: string;
  CEP?: string;
  Cidade?: string;
}): boolean {
  const street = String(row.Lougradouro ?? "").trim();
  if (!street) return false;
  if (looksLikeFullAddress(street)) {
    const partsFilled = [row.Numero, row.Bairro, row.CEP, row.Cidade].filter(
      (v) => String(v ?? "").trim() !== "",
    ).length;
    if (partsFilled < 2) return true;
  }
  // Também manda à IA se o logradouro não começa com tipo de via padrão
  if (!hasStandardLogradouroType(street) && street.length >= 3) return true;
  return false;
}

const LOGRADOURO_TYPE_RE =
  /^(rua|avenida|pra[cç]a|travessa|rodovia|alameda|estrada|r\.|av\.|trav\.|tv\.|al\.|pc\.|p[cç]a?\.?|rod\.|est\.)\b/i;

export function hasStandardLogradouroType(value: unknown): boolean {
  return LOGRADOURO_TYPE_RE.test(String(value ?? "").trim());
}
