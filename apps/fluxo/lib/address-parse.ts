/**
 * Parser generalista de "endereço completo" (Google Forms, planilhas, texto livre).
 * Extrai logradouro, número, complemento, bairro, cidade, UF e CEP sem depender
 * de um único formato de vírgulas.
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

const STREET_TYPE_RE =
  /(?:^|[\s,])(?:rua|avenida|travessa|alameda|pra[cç]a|rodovia|estrada|largo|beco|viela|vila|via|viaduto|ladeira|passagem|servid[aã]o|condom[ií]nio|conjunto|quadra)\b|(?:^|[\s,])(?:r|av|trav|tv|al|pc|p[cç]a?|rod|est|qd)\.?(?=[\s,]|$)/i;

const COMPLEMENT_RE =
  /\b(apto|apartamento|ap\.?|bl\.?|bloco|casa|fundos|sala|loja|sobreloja|andar|cobertura|kitnet|studio|torre|ed\.?|edif[ií]cio|condom[ií]nio|qd\.?|quadra|lt\.?|lote|cs\.?)\b/i;

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

function cleanSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function scrubSeparators(value: string) {
  // Trim primeiro: após remover CEP/"CEP …" sobra "…/SP - " ou "…Paraná,"
  // e o $ da regex de separadores falharia no espaço residual.
  let v = cleanSpaces(value);
  v = v.replace(/^[,\-–—/;|:]+/, "").replace(/[,\-–—/;|:]+$/, "");
  return cleanSpaces(v);
}

/** Cabeçalho típico de "endereço completo". */
export function isFullAddressHeader(source: string): boolean {
  const key = normalizeHeaderKeyLocal(source);

  if (/endereco_completo|full_?address|complete_address/.test(key)) return true;
  if (/endereco_residencial|endereco_com_cep|endereco_atual/.test(key)) return true;
  if (/qual_.*endereco|seu_endereco|informe_.*endereco|digite_.*endereco/.test(key)) {
    return true;
  }
  if (/onde_.*mora|local_de_residencia|endereco_de_residencia/.test(key)) return true;
  if (/mora/.test(key) && /endereco/.test(key)) return true;
  if (/endereco/.test(key) && /completo/.test(key)) return true;
  if (/endereco/.test(key) && /bairro/.test(key) && /(cidade|cep)/.test(key)) {
    return true;
  }
  if (/endereco/.test(key) && /rua/.test(key) && /numero/.test(key)) {
    return true;
  }
  // Pergunta longa só com "endereço" + pedido de detalhe
  if (
    /endereco/.test(key) &&
    /(logradouro|rua|numero|cep|cidade|estado|bairro)/.test(key)
  ) {
    return true;
  }
  return false;
}

/** Texto que ainda parece endereço completo (candidato à divisão). */
export function looksLikeFullAddress(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (raw.length < 8) return false;
  if (/\bcep\b/i.test(raw)) return true;
  if (/\d{5}-?\d{3}/.test(raw)) return true;
  if (
    new RegExp(
      String.raw`(?:^|[\s,/\-–])(${[...UF_SET].join("|")})(?:$|[\s,;.])`,
      "i",
    ).test(raw)
  ) {
    return true;
  }
  // "Cidade - MG" / "Cidade/MG"
  if (/[\/\-–—]\s*[A-Za-z]{2}\s*$/.test(raw) && UF_SET.has(raw.slice(-2).toUpperCase())) {
    return true;
  }
  const separators = (raw.match(/[,;|/]| - /g) ?? []).length;
  if (separators >= 2) return true;
  if (separators >= 1 && /\d/.test(raw) && raw.length >= 12) return true;
  if (STREET_TYPE_RE.test(raw) && /\d/.test(raw) && raw.length >= 14) return true;
  if (STREET_TYPE_RE.test(raw) && /\b(bairro|cidade|cep)\b/i.test(raw)) return true;
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

function emptyParsed(): ParsedFullAddress {
  return {
    Lougradouro: "",
    Numero: "",
    Complemento: "",
    Bairro: "",
    CEP: "",
    Cidade: "",
    Estado: "",
  };
}

function extractCep(raw: string): { cep: string; rest: string } {
  const patterns = [
    /\bcep\s*[:=-]?\s*(\d{2}\.?\d{3}-?\d{3})\b/i,
    /\bcep\s*[:=-]?\s*(\d{5}-?\d{3})\b/i,
    /\b(\d{2}\.\d{3}-\d{3})\b/,
    /\b(\d{5}-\d{3})\b/,
    /\b(\d{8})\b/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m?.[1]) continue;
    const digits = m[1].replace(/\D/g, "");
    if (digits.length !== 8) continue;
    return {
      cep: digits,
      rest: scrubSeparators(raw.replace(m[0], " ")),
    };
  }
  return { cep: "", rest: raw };
}

function matchUfToken(token: string): string {
  const raw = token.trim();
  const t = stripAccents(raw).toLowerCase();
  // Código UF: só se o token já for 2 letras ASCII ("SP", "Mg") —
  // evita "Sé" → "se" → SE.
  if (/^[A-Za-z]{2}$/.test(raw) && UF_SET.has(raw.toUpperCase())) {
    return raw.toUpperCase();
  }
  return UF_NAME_TO_CODE[t] ?? "";
}

/** Nomes de UF que também são cidades — nunca consumir sozinhos como estado. */
const CITY_ALSO_STATE = new Set(["sao paulo", "rio de janeiro"]);

function extractUf(raw: string): { uf: string; rest: string } {
  const text = scrubSeparators(raw);
  if (!text) return { uf: "", rest: raw };

  // 1) Código de 2 letras no fim: "…/SP", "… - SP", "…, SP", "… SP"
  const codeAtEnd = text.match(/[\/\-–—,\s]\s*([A-Za-z]{2})\s*\.?$/);
  if (codeAtEnd?.[1] && UF_SET.has(codeAtEnd[1].toUpperCase())) {
    return {
      uf: codeAtEnd[1].toUpperCase(),
      rest: scrubSeparators(text.slice(0, codeAtEnd.index)),
    };
  }

  // 2) Nome do estado após separador: "… - Minas Gerais", "…/Paraná"
  const nameAfterSep = text.match(
    /[\/\-–—]\s*([A-Za-zÀ-ú]{3,}(?:\s+[A-Za-zÀ-ú]+)*)\s*$/,
  );
  if (nameAfterSep?.[1]) {
    const token = stripAccents(nameAfterSep[1]).toLowerCase();
    const uf = UF_NAME_TO_CODE[token];
    if (uf && !CITY_ALSO_STATE.has(token)) {
      return {
        uf,
        rest: scrubSeparators(text.slice(0, nameAfterSep.index)),
      };
    }
  }

  // 3) Nome do estado no fim (após espaço/vírgula): "…, Paraná"
  const lower = stripAccents(text).toLowerCase();
  const names = Object.keys(UF_NAME_TO_CODE).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (CITY_ALSO_STATE.has(name)) continue;
    const re = new RegExp(`(?:^|[\\s,])${name}\\s*$`, "i");
    const m = lower.match(re);
    if (!m || m.index === undefined) continue;
    // "para" isolado demais — só aceita se o token inteiro for o nome
    if (name === "para" && lower.trim() !== "para" && m[0].trim() !== "para") {
      continue;
    }
    return {
      uf: UF_NAME_TO_CODE[name]!,
      rest: scrubSeparators(text.slice(0, m.index)),
    };
  }

  return { uf: "", rest: text };
}

function isNumeroToken(part: string): boolean {
  const t = cleanSpaces(part);
  if (!t) return false;
  const plain = stripAccents(t).toLowerCase();
  if (/^(s\/?n|sn|sem numero|sem n[º°.]?)$/.test(plain)) return true;
  if (/^(n[º°o.]?\s*)?\d{1,6}[A-Za-z]?$/i.test(t)) return true;
  if (/^n[úu]mero\s*:?\s*\d{1,6}[A-Za-z]?$/i.test(plain)) return true;
  return false;
}

function cleanNumero(part: string): string {
  const t = cleanSpaces(part);
  const plain = stripAccents(t).toLowerCase();
  if (/^(s\/?n|sn|sem numero|sem n[º°.]?)$/.test(plain)) return "S/N";
  return t
    .replace(/^(n[úu]mero|n[º°o.]?)\s*:?\s*/i, "")
    .trim();
}

function isComplementToken(part: string): boolean {
  return COMPLEMENT_RE.test(part);
}

/** Extrai campos rotulados: "Bairro: Centro", "Cidade - BH", etc. */
function extractLabeledFields(raw: string): {
  fields: Partial<ParsedFullAddress>;
  rest: string;
} {
  const fields: Partial<ParsedFullAddress> = {};
  let rest = raw;

  const specs: Array<{
    key: keyof ParsedFullAddress;
    re: RegExp;
  }> = [
    {
      key: "CEP",
      re: /\bcep\s*[:=-]?\s*(\d{2}\.?\d{3}-?\d{3}|\d{5}-?\d{3}|\d{8})\b/gi,
    },
    {
      key: "Numero",
      re: /\b(?:n[úu]mero|n[º°]|nº|n°|num\.)\s*[:=-]?\s*(s\/?n|sn|\d{1,6}[A-Za-z]?)\b/gi,
    },
    {
      key: "Bairro",
      re: /\bbairro\s*[:=-]?\s*([^,;|/]+?)(?=(?:,|;|\||\/|\s+-\s+|\s+cidade\b|\s+cep\b|\s+estado\b|\s+uf\b|$))/gi,
    },
    {
      key: "Cidade",
      re: /\bcidade\s*[:=-]?\s*([^,;|/]+?)(?=(?:,|;|\||\/|\s+-\s+|\s+bairro\b|\s+cep\b|\s+estado\b|\s+uf\b|$))/gi,
    },
    {
      key: "Estado",
      re: /\b(?:estado|uf)\s*[:=-]?\s*([A-Za-zÀ-ú]{2,}(?:\s+[A-Za-zÀ-ú]+)?)\b/gi,
    },
    {
      key: "Lougradouro",
      re: /\b(?:logradouro|lougradouro|endere[cç]o|rua|avenida)\s*[:=-]\s*([^,;|/]+?)(?=(?:,|;|\||\/|\s+-\s+|\s+n[º°o.]?\b|\s+numero\b|\s+bairro\b|\s+cidade\b|\s+cep\b|$))/gi,
    },
    {
      key: "Complemento",
      re: /\bcomplemento\s*[:=-]?\s*([^,;|/]+?)(?=(?:,|;|\||\/|\s+-\s+|\s+bairro\b|\s+cidade\b|\s+cep\b|$))/gi,
    },
  ];

  for (const { key, re } of specs) {
    re.lastIndex = 0;
    const m = re.exec(rest);
    if (!m?.[1]) continue;
    let value = cleanSpaces(m[1]);
    if (key === "CEP") value = value.replace(/\D/g, "");
    if (key === "Numero") value = cleanNumero(value);
    if (key === "Estado") value = matchUfToken(value) || value.toUpperCase().slice(0, 2);
    if (!fields[key]) fields[key] = value;
    rest = scrubSeparators(rest.replace(m[0], " "));
  }

  return { fields, rest };
}

/** Número colado no fim OU no meio (sem vírgulas): "Rua X 123 Centro Cidade". */
function splitStreetNumberAndTail(street: string): {
  lougradouro: string;
  numero: string;
  tail: string;
} {
  const raw = cleanSpaces(street);
  if (!raw) return { lougradouro: "", numero: "", tail: "" };

  const labeled = raw.match(
    /^(.*?)[,\s]+(?:n[úu]mero|n[º°]|nº|n°|num\.)\s*:?\s*(s\/?n|sn|\d{1,6}[A-Za-z]?)\s*(.*)$/i,
  );
  if (labeled) {
    return {
      lougradouro: cleanSpaces(labeled[1]!),
      numero: cleanNumero(labeled[2]!),
      tail: cleanSpaces(labeled[3] ?? ""),
    };
  }

  // Com tipo de via: "Alameda Santos 700 Bela Vista São Paulo"
  if (STREET_TYPE_RE.test(raw)) {
    const mid = raw.match(
      /^(.+?)\s+(\d{1,6}[A-Za-z]?|s\/?n|sn)(?:\s+(.+))?$/i,
    );
    if (mid && STREET_TYPE_RE.test(mid[1]!) && mid[1]!.trim().length >= 5) {
      const numRaw = mid[2]!;
      const streetHead = mid[1]!;
      // Não tratar "Km 12" / "BR-040" como número do imóvel
      if (/\bkm\.?$/i.test(streetHead.trim())) {
        return { lougradouro: raw, numero: "", tail: "" };
      }
      const numDigits = numRaw.replace(/\D/g, "");
      if (/^s\/?n$/i.test(numRaw) || (numDigits.length >= 1 && numDigits.length <= 6)) {
        return {
          lougradouro: cleanSpaces(streetHead),
          numero: cleanNumero(numRaw),
          tail: cleanSpaces(mid[3] ?? ""),
        };
      }
    }
  }

  const trailing = raw.match(/^(.*?)[,\s]+(\d{1,6}[A-Za-z]?|s\/?n|sn)$/i);
  if (trailing && STREET_TYPE_RE.test(trailing[1]!) && trailing[1]!.length >= 5) {
    return {
      lougradouro: cleanSpaces(trailing[1]!),
      numero: cleanNumero(trailing[2]!),
      tail: "",
    };
  }

  return { lougradouro: raw, numero: "", tail: "" };
}

function splitStreetAndNumber(street: string): { lougradouro: string; numero: string } {
  const s = splitStreetNumberAndTail(street);
  return { lougradouro: s.lougradouro, numero: s.numero };
}

function splitParts(raw: string): string[] {
  // Normaliza traços longos usados como separador de seção
  const normalized = raw
    .replace(/\r?\n+/g, ", ")
    .replace(/\s+[|]\s+/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/\s+[–—]\s+/g, ", ");

  return normalized
    .split(/[,;]+/)
    .map((p) => cleanSpaces(p))
    .filter(Boolean);
}

/** Cidades brasileiras multi-palavra comuns no fim de cauda sem vírgula. */
const MULTIWORD_CITIES = [
  "sao paulo",
  "rio de janeiro",
  "belo horizonte",
  "porto alegre",
  "campo grande",
  "boa vista",
  "feira de santana",
  "ribeirao preto",
  "sao bernardo do campo",
  "sao jose dos campos",
  "sao goncalo",
  "juiz de fora",
  "mogi das cruzes",
  "jaboatao dos guararapes",
  "aparecida de goiania",
  "sao jose do rio preto",
  "caxias do sul",
  "campos dos goytacazes",
  "vila velha",
  "serra",
  "lagoa grande",
  "montes claros",
  "governador valadares",
  "divinopolis",
  "sao joao del rei",
  "conselheiro lafaiete",
].sort((a, b) => b.length - a.length);

/**
 * "Bela Vista São Paulo" → { bairro: "Bela Vista", cidade: "São Paulo" }
 * Heurística: última cidade multi-palavra conhecida, senão última palavra.
 */
function splitBairroCidadeTail(tail: string): { bairro: string; cidade: string } {
  const text = cleanSpaces(tail);
  if (!text) return { bairro: "", cidade: "" };

  const lower = stripAccents(text).toLowerCase();
  for (const city of MULTIWORD_CITIES) {
    if (lower === city) return { bairro: "", cidade: text };
    if (lower.endsWith(" " + city)) {
      const cut = text.length - city.length;
      // Recorta pelo tamanho em chars sem acento ≈ com acento para nomes comuns
      const prefix = cleanSpaces(text.slice(0, Math.max(0, cut)));
      const cidade = cleanSpaces(text.slice(Math.max(0, cut)));
      if (prefix) return { bairro: prefix, cidade };
      return { bairro: "", cidade: text };
    }
  }

  const words = text.split(/\s+/);
  if (words.length >= 2) {
    return {
      bairro: cleanSpaces(words.slice(0, -1).join(" ")),
      cidade: words[words.length - 1]!,
    };
  }
  return { bairro: "", cidade: text };
}

function filledCount(p: ParsedFullAddress): number {
  return [p.Numero, p.Complemento, p.Bairro, p.CEP, p.Cidade, p.Estado].filter(
    (v) => String(v ?? "").trim() !== "",
  ).length;
}

/**
 * Divide endereço em linha única nos campos do SIGA.
 * Aceita vírgulas, traços, barras, rótulos e número colado na rua.
 */
export function parseFullAddress(value: unknown): ParsedFullAddress | null {
  const original = cleanSpaces(String(value ?? ""));
  if (!original || !looksLikeFullAddress(original)) return null;

  const out = emptyParsed();
  let working = original;

  // 1) CEP
  const cepHit = extractCep(working);
  out.CEP = cepHit.cep;
  working = cepHit.rest;

  // 2) Campos rotulados (Bairro:, Cidade:, etc.)
  const labeled = extractLabeledFields(working);
  Object.assign(out, Object.fromEntries(
    Object.entries(labeled.fields).filter(([, v]) => v && String(v).trim()),
  ));
  working = labeled.rest;

  // 3) UF residual
  if (!out.Estado) {
    const ufHit = extractUf(working);
    out.Estado = ufHit.uf;
    working = ufHit.rest;
  } else {
    // Já temos UF (ex.: de /SP). Não consumir "São Paulo"/"Rio de Janeiro" como nome do estado.
    const bareCode = working.match(/[\/\-–—,\s]+([A-Za-z]{2})\s*$/);
    if (
      bareCode?.[1] &&
      UF_SET.has(bareCode[1].toUpperCase()) &&
      bareCode[1].toUpperCase() === out.Estado
    ) {
      working = scrubSeparators(working.slice(0, bareCode.index));
    }
  }

  const parts = splitParts(working);

  // 4) Classifica partes restantes
  const unused: string[] = [];
  for (const part of parts) {
    if (!part) continue;

    // UF pura ("MG", "Paraná") — não vira cidade
    const bare = part.trim();
    const bareUf = matchUfToken(bare);
    if (
      bareUf &&
      (bare.length === 2 || !CITY_ALSO_STATE.has(stripAccents(bare).toLowerCase()))
    ) {
      if (!out.Estado) out.Estado = bareUf;
      continue;
    }

    // "Cidade/MG"
    const citySlashUf = bare.match(
      /^(.+?)\s*[\/\-–—]\s*([A-Za-z]{2})$/,
    );
    if (citySlashUf && UF_SET.has(citySlashUf[2]!.toUpperCase())) {
      if (!out.Estado) out.Estado = citySlashUf[2]!.toUpperCase();
      const city = cleanSpaces(citySlashUf[1]!);
      if (city) unused.push(city);
      continue;
    }

    if (!out.Numero && isNumeroToken(part)) {
      out.Numero = cleanNumero(part);
      continue;
    }
    if (!out.Complemento && isComplementToken(part)) {
      out.Complemento = part;
      continue;
    }
    unused.push(part);
  }

  // 5) Monta logradouro / bairro / cidade a partir do que sobrou
  if (!out.Lougradouro && unused.length > 0) {
    const streetIdx = unused.findIndex((p) => STREET_TYPE_RE.test(p));
    if (streetIdx >= 0) {
      out.Lougradouro = unused.splice(streetIdx, 1)[0]!;
    } else {
      out.Lougradouro = unused.shift()!;
    }
  }

  // Número no meio/fim do logradouro + possível cauda (bairro/cidade sem vírgula)
  if (out.Lougradouro) {
    const split = splitStreetNumberAndTail(out.Lougradouro);
    out.Lougradouro = split.lougradouro;
    if (!out.Numero && split.numero) out.Numero = split.numero;
    if (split.tail) unused.push(...splitParts(split.tail));
  }

  if (!out.Cidade && unused.length > 0) {
    out.Cidade = unused.pop()!;
  }
  if (!out.Bairro && unused.length > 0) {
    out.Bairro = unused.join(", ");
    unused.length = 0;
  } else if (unused.length > 0) {
    // Sobras → complemento se ainda vazio, senão anexa ao bairro
    if (!out.Complemento && unused.some((p) => isComplementToken(p))) {
      out.Complemento = unused.filter((p) => isComplementToken(p)).join(", ");
      const rest = unused.filter((p) => !isComplementToken(p));
      if (rest.length) {
        out.Bairro = out.Bairro
          ? `${out.Bairro}, ${rest.join(", ")}`
          : rest.join(", ");
      }
    } else {
      out.Bairro = out.Bairro
        ? `${out.Bairro}, ${unused.join(", ")}`
        : unused.join(", ");
    }
  }

  // Cauda sem vírgula: "Bela Vista São Paulo" veio como uma só "cidade"
  if (out.Cidade && !out.Bairro && /\s/.test(out.Cidade) && !/,/.test(out.Cidade)) {
    const split = splitBairroCidadeTail(out.Cidade);
    if (split.bairro && split.cidade) {
      out.Bairro = split.bairro;
      out.Cidade = split.cidade;
    }
  }

  // Cidade ainda pode carregar UF no fim: "Lagoa Grande Mg" / "BH/MG"
  // Não consumir nome de estado inteiro (ex. "Paraná" ou "São Paulo") como UF aqui.
  if (out.Cidade) {
    const codeTail = out.Cidade.match(/^(.*?)[\/\-–—,\s]\s*([A-Za-z]{2})\s*$/);
    if (codeTail?.[2] && UF_SET.has(codeTail[2].toUpperCase())) {
      const city = scrubSeparators(codeTail[1]!);
      if (city) {
        out.Cidade = city;
        if (!out.Estado) out.Estado = codeTail[2].toUpperCase();
      }
    }
  }

  // Limpeza final
  out.Lougradouro = scrubSeparators(out.Lougradouro);
  out.Numero = scrubSeparators(out.Numero);
  out.Complemento = scrubSeparators(out.Complemento);
  out.Bairro = scrubSeparators(out.Bairro);
  out.Cidade = scrubSeparators(out.Cidade);
  out.Estado = out.Estado.toUpperCase();
  if (out.Estado.length === 2 && !UF_SET.has(out.Estado)) out.Estado = "";

  if (filledCount(out) === 0) {
    // Só logradouro sem partes → não considera parse útil
    if (!out.Lougradouro || out.Lougradouro === original) return null;
  }

  // Se o "logradouro" ficou sendo a string quase inteira e só achamos CEP/UF,
  // tenta um último passe simples por vírgulas clássicas
  if (
    out.Lougradouro &&
    out.Lougradouro.length > original.length * 0.75 &&
    filledCount(out) <= 1
  ) {
    const classic = parseClassicCommaAddress(original);
    if (classic && filledCount(classic) > filledCount(out)) return classic;
  }

  return out;
}

/** Fallback clássico: "rua, número, bairro, cidade UF, cep" */
function parseClassicCommaAddress(original: string): ParsedFullAddress | null {
  const { cep, rest: afterCep } = extractCep(original);
  const { uf, rest: afterUf } = extractUf(afterCep);
  const parts = splitParts(afterUf);
  if (parts.length < 2) return null;

  const out = emptyParsed();
  out.CEP = cep;
  out.Estado = uf;
  out.Lougradouro = parts[0] ?? "";

  let i = 1;
  if (parts[i] && isNumeroToken(parts[i]!)) {
    out.Numero = cleanNumero(parts[i]!);
    i += 1;
  } else if (out.Lougradouro) {
    const split = splitStreetAndNumber(out.Lougradouro);
    out.Lougradouro = split.lougradouro;
    out.Numero = split.numero;
  }
  if (parts[i] && isComplementToken(parts[i]!)) {
    out.Complemento = parts[i]!;
    i += 1;
  }
  const rem = parts.slice(i);
  if (rem.length === 1) out.Cidade = rem[0]!;
  else if (rem.length >= 2) {
    out.Cidade = rem[rem.length - 1]!;
    out.Bairro = rem.slice(0, -1).join(", ");
  }
  if (out.Cidade && !out.Estado) {
    const codeTail = out.Cidade.match(/^(.*?)[\/\-–—,\s]\s*([A-Za-z]{2})\s*$/);
    if (codeTail?.[2] && UF_SET.has(codeTail[2].toUpperCase())) {
      const city = scrubSeparators(codeTail[1]!);
      if (city) {
        out.Cidade = city;
        out.Estado = codeTail[2].toUpperCase();
      }
    }
  }
  return filledCount(out) > 0 ? out : null;
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
  return false;
}

const LOGRADOURO_TYPE_RE =
  /(?:^|[\s,])(?:rua|avenida|travessa|alameda|pra[cç]a|rodovia|estrada|largo|beco|viela)|(?:^|[\s,])(?:r|av|trav|tv|al|pc|p[cç]a?|rod|est)\.?(?=[\s,]|$)/i;

export function hasStandardLogradouroType(value: unknown): boolean {
  return LOGRADOURO_TYPE_RE.test(String(value ?? "").trim());
}
