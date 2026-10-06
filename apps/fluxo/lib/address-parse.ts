/**
 * Detecção e divisão de "endereço completo" (Google Forms etc.).
 * Preferência: parser determinístico; IA só como reforço opcional.
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

const UF_NAME_TO_CODE: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeHeaderKeyLocal(source: string) {
  return stripAccents(source)
    .trim()
    .toLowerCase()
    .replace(/[?!:;,()[\]{}"'`´]/g, " ")
    .replace(/[\s./\\+-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

/** Cabeçalho típico de "endereço completo". */
export function isFullAddressHeader(source: string): boolean {
  const key = normalizeHeaderKeyLocal(source);

  if (/endereco_completo/.test(key)) return true;
  if (/endereco_residencial|endereco_com_cep|full_?address/.test(key)) return true;
  if (/qual_.*endereco|seu_endereco_completo|informe_.*endereco/.test(key)) {
    return true;
  }
  if (/endereco/.test(key) && /completo/.test(key)) return true;
  if (/endereco/.test(key) && /bairro/.test(key) && /(cidade|cep)/.test(key)) {
    return true;
  }
  if (/endereco/.test(key) && /rua/.test(key) && /numero/.test(key)) {
    return true;
  }
  return false;
}

/** Texto que ainda parece endereço completo (candidato à divisão). */
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

export type ParsedFullAddress = {
  Lougradouro: string;
  Numero: string;
  Complemento: string;
  Bairro: string;
  CEP: string;
  Cidade: string;
  Estado: string;
};

function extractCep(raw: string): { cep: string; rest: string } {
  const labeled = raw.match(/\bcep\s*:?\s*(\d{5}-?\d{3})\b/i);
  if (labeled?.[1]) {
    return {
      cep: labeled[1].replace(/\D/g, ""),
      rest: raw.replace(labeled[0], " ").replace(/\s+/g, " ").trim(),
    };
  }
  const bare = raw.match(/\b(\d{5}-?\d{3})\b/);
  if (bare?.[1]) {
    return {
      cep: bare[1].replace(/\D/g, ""),
      rest: raw.replace(bare[0], " ").replace(/\s+/g, " ").trim(),
    };
  }
  return { cep: "", rest: raw };
}

function extractUf(raw: string): { uf: string; rest: string } {
  const slash = raw.match(/[\/\-–—]\s*([A-Za-z]{2})\s*$/);
  if (slash?.[1] && UF_SET.has(slash[1].toUpperCase())) {
    return {
      uf: slash[1].toUpperCase(),
      rest: raw.slice(0, slash.index).trim().replace(/[,\s]+$/, ""),
    };
  }

  const trailingCode = raw.match(/(?:^|[\s,])([A-Za-z]{2})\s*$/);
  if (trailingCode?.[1] && UF_SET.has(trailingCode[1].toUpperCase())) {
    return {
      uf: trailingCode[1].toUpperCase(),
      rest: raw.slice(0, trailingCode.index).trim().replace(/[,\s]+$/, ""),
    };
  }

  const lower = stripAccents(raw).toLowerCase();
  const names = Object.keys(UF_NAME_TO_CODE).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const re = new RegExp(`(?:^|[\\s,])${name}\\s*$`, "i");
    if (re.test(lower)) {
      const m = lower.match(re);
      if (!m || m.index === undefined) continue;
      return {
        uf: UF_NAME_TO_CODE[name]!,
        rest: raw.slice(0, m.index).trim().replace(/[,\s]+$/, ""),
      };
    }
  }

  return { uf: "", rest: raw };
}

function isNumeroPart(part: string): boolean {
  const t = part.trim();
  if (!t) return false;
  if (/^(s\/?n|sem\s+numero)$/i.test(stripAccents(t))) return true;
  if (/^\d{1,6}[A-Za-z]?$/.test(t)) return true;
  if (/^(n[º°.]?\s*)?\d{1,6}[A-Za-z]?$/i.test(t)) return true;
  return false;
}

function cleanNumero(part: string): string {
  const t = part.trim();
  if (/^(s\/?n|sem\s+numero)$/i.test(stripAccents(t))) return "S/N";
  return t.replace(/^(n[º°.]?\s*)/i, "").trim();
}

/**
 * Divide endereço em linha única nos campos do SIGA.
 * Ex.: "Rua Joaquim Galvão, 470, Céu Azul, Lagoa Grande Mg, Cep: 38755-000"
 */
export function parseFullAddress(value: unknown): ParsedFullAddress | null {
  const original = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!original || !looksLikeFullAddress(original)) return null;

  let working = original.replace(/\s+/g, " ");
  const { cep, rest: afterCep } = extractCep(working);
  working = afterCep.replace(/,+\s*$/, "").trim();

  const { uf, rest: afterUf } = extractUf(working);
  working = afterUf.replace(/,+\s*$/, "").trim();

  const parts = working
    .split(/[,;|]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0 && !cep && !uf) return null;

  let lougradouro = "";
  let numero = "";
  let complemento = "";
  let bairro = "";
  let cidade = "";

  if (parts.length === 1) {
    lougradouro = parts[0]!;
  } else if (parts.length === 2) {
    lougradouro = parts[0]!;
    if (isNumeroPart(parts[1]!)) numero = cleanNumero(parts[1]!);
    else cidade = parts[1]!;
  } else if (parts.length === 3) {
    lougradouro = parts[0]!;
    if (isNumeroPart(parts[1]!)) {
      numero = cleanNumero(parts[1]!);
      cidade = parts[2]!;
    } else {
      bairro = parts[1]!;
      cidade = parts[2]!;
    }
  } else {
    // 4+: rua, número?, …bairro, cidade
    lougradouro = parts[0]!;
    let i = 1;
    if (parts[i] && isNumeroPart(parts[i]!)) {
      numero = cleanNumero(parts[i]!);
      i += 1;
    }
    // Complemento opcional (apto, bloco, casa…)
    if (
      parts[i] &&
      /^(apto|apartamento|ap\.?|bl\.?|bloco|casa|fundos|sala|loja)\b/i.test(
        parts[i]!,
      )
    ) {
      complemento = parts[i]!;
      i += 1;
    }
    const remaining = parts.slice(i);
    if (remaining.length === 1) {
      cidade = remaining[0]!;
    } else if (remaining.length >= 2) {
      cidade = remaining[remaining.length - 1]!;
      bairro = remaining.slice(0, -1).join(", ");
    }
  }

  // Cidade ainda pode carregar UF colada: "Lagoa Grande Mg"
  if (cidade && !uf) {
    const cityUf = extractUf(cidade);
    if (cityUf.uf) {
      cidade = cityUf.rest;
      return {
        Lougradouro: lougradouro,
        Numero: numero,
        Complemento: complemento,
        Bairro: bairro,
        CEP: cep,
        Cidade: cidade,
        Estado: cityUf.uf,
      };
    }
  }

  const parsed: ParsedFullAddress = {
    Lougradouro: lougradouro,
    Numero: numero,
    Complemento: complemento,
    Bairro: bairro,
    CEP: cep,
    Cidade: cidade,
    Estado: uf,
  };

  // Precisa ter extraído algo além de só repetir a string inteira no logradouro
  const filled = [parsed.Numero, parsed.Bairro, parsed.CEP, parsed.Cidade, parsed.Estado].filter(
    (v) => v.trim() !== "",
  ).length;
  if (filled === 0 && parsed.Lougradouro === original) return null;
  if (filled === 0 && !looksLikeFullAddress(original)) return null;
  if (filled === 0) return null;

  return parsed;
}

/**
 * Preenche campos vazios a partir de um endereço completo em Lougradouro.
 * Não sobrescreve valores já mapeados de outras colunas.
 */
export function applyParsedFullAddress<T extends Record<string, unknown>>(row: T): T {
  const street = String(row.Lougradouro ?? "").trim();
  if (!street) return row;
  const parsed = parseFullAddress(street);
  if (!parsed) return row;

  const next = { ...row } as Record<string, unknown>;
  const fill = (key: keyof ParsedFullAddress, target = key as string) => {
    const current = String(next[target] ?? "").trim();
    if (!current && parsed[key]) next[target] = parsed[key];
  };

  // Sempre troca Lougradouro pelo trecho só da via quando o parser extraiu partes
  if (parsed.Lougradouro && parsed.Lougradouro !== street) {
    next.Lougradouro = parsed.Lougradouro;
  }
  fill("Numero");
  fill("Complemento");
  fill("Bairro");
  fill("CEP");
  fill("Cidade");
  fill("Estado");
  return next as T;
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
  // Se o parser local já desmembrou, não precisa de IA
  const trial = applyParsedFullAddress({
    Lougradouro: street,
    Numero: row.Numero,
    Bairro: row.Bairro,
    CEP: row.CEP,
    Cidade: row.Cidade,
  });
  const partsFilled = [trial.Numero, trial.Bairro, trial.CEP, trial.Cidade].filter(
    (v) => String(v ?? "").trim() !== "",
  ).length;
  if (looksLikeFullAddress(String(trial.Lougradouro ?? "")) && partsFilled < 2) {
    return true;
  }
  if (!hasStandardLogradouroType(trial.Lougradouro) && String(trial.Lougradouro).length >= 3) {
    // Só pede IA se ainda parece endereço completo
    return looksLikeFullAddress(street) && partsFilled < 2;
  }
  return false;
}

const LOGRADOURO_TYPE_RE =
  /^(rua|avenida|pra[cç]a|travessa|rodovia|alameda|estrada|r\.|av\.|trav\.|tv\.|al\.|pc\.|p[cç]a?\.?|rod\.|est\.)\b/i;

export function hasStandardLogradouroType(value: unknown): boolean {
  return LOGRADOURO_TYPE_RE.test(String(value ?? "").trim());
}
