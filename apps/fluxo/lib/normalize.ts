import { differenceInYears, isValid, parse, parseISO } from "date-fns";
import {
  emptySigaCulturalRow,
  ETNIAS,
  GENEROS,
  SigaCulturalRowSchema,
  type BatchContext,
  type Etnia,
  type Genero,
  type SigaCulturalRow,
} from "@/lib/schema";
import {
  CONTEXT_COLUMNS,
  HEADER_SYNONYMS,
  normalizeHeaderKey,
  projectRowWithMapping,
} from "@/lib/column-map";
import { enrichCidadeEstado } from "@/lib/municipio-uf";

export { normalizeHeaderKey, HEADER_SYNONYMS } from "@/lib/column-map";
export type { SigaCulturalColumn } from "@/lib/schema";
export {
  isFullAddressHeader,
  looksLikeFullAddress,
} from "@/lib/address-parse";

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeCpf(value: unknown): string {
  let d = digitsOnly(value);
  if (d.length === 10) d = d.padStart(11, "0");
  return d.slice(0, 11);
}

/**
 * Extrai o ano do projeto (ex.: "Movimenta Cultura - 2ª Edição 2025" → "2025").
 * Prefere o último ano 19xx/20xx encontrado no texto.
 */
export function extractProjectYear(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^(19|20)\d{2}$/.test(raw)) return raw;
  const matches = [...raw.matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => m[1]!);
  return matches.length ? matches[matches.length - 1]! : "";
}

/** Guarda só YYYY quando há ano no texto; senão mantém o texto limpo. */
export function normalizeAnoProjeto(value: unknown): string {
  const raw = String(value ?? "").trim();
  const year = extractProjectYear(raw);
  if (year) return year;
  return raw;
}

/** CPF só dígitos (padrão oficial); helper de exibição opcional */
export function formatCpfDisplay(value: unknown): string {
  const d = normalizeCpf(value);
  if (d.length !== 11) return d;
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function normalizeCep(value: unknown): string {
  return digitsOnly(value).slice(0, 8);
}

export function formatCepDisplay(value: unknown): string {
  const d = normalizeCep(value);
  if (d.length !== 8) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Telefone: só dígitos no armazenamento (exibição formatada na UI) */
export function normalizePhone(value: unknown): string {
  let d = digitsOnly(value);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    d = d.slice(2);
  }
  return d.slice(0, 11);
}

/** Telefone BR para exibição: (11) 98888-7777 ou (11) 3333-4444 */
export function formatPhoneDisplay(value: unknown): string {
  const d = normalizePhone(value);
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (d.length === 10) {
    return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return d;
}

/** Link WhatsApp (wa.me) para telefone BR com DDD; null se inválido. */
export function whatsappUrl(value: unknown): string | null {
  const d = normalizePhone(value);
  if (d.length !== 10 && d.length !== 11) return null;
  return `https://wa.me/55${d}`;
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Título simples para nomes/endereços (pt-BR) */
export function normalizePersonName(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const lower = ["da", "de", "do", "das", "dos", "e"];
  return raw
    .toLowerCase()
    .split(" ")
    .map((part, i) => {
      if (i > 0 && lower.includes(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function normalizeAddressLine(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  // mantém abreviações comuns
  return raw
    .split(" ")
    .map((part) => {
      const p = part.toLowerCase();
      if (["r.", "av.", "trav.", "al.", "pc.", "pç."].includes(p)) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      if (/^\d+[a-z]?$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

const LOGRADOURO_TYPES = [
  "Rua",
  "Avenida",
  "Praça",
  "Travessa",
  "Rodovia",
  "Alameda",
  "Estrada",
] as const;

/**
 * Padroniza o logradouro com tipo de via por extenso:
 * Rua | Avenida | Praça | Travessa | Rodovia | Alameda | Estrada
 */
export function normalizeLogradouro(value: unknown): string {
  let raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  const rules: Array<[RegExp, (typeof LOGRADOURO_TYPES)[number]]> = [
    [/^(avenida|av\.?)\b/i, "Avenida"],
    [/^(travessa|trav\.?|tv\.?)\b/i, "Travessa"],
    [/^(rodovia|rod\.?)\b/i, "Rodovia"],
    [/^(alameda|al\.?)\b/i, "Alameda"],
    [/^(estrada|est\.?)\b/i, "Estrada"],
    [/^(pra[cç]a|p[cç]a?\.?|pc\.?)\b/i, "Praça"],
    [/^(rua|r\.?)\b/i, "Rua"],
  ];

  let type: (typeof LOGRADOURO_TYPES)[number] | null = null;
  let rest = raw;
  for (const [re, canon] of rules) {
    if (re.test(raw)) {
      type = canon;
      rest = raw.replace(re, "").replace(/^[\s,.\-–—]+/, "").trim();
      break;
    }
  }

  const titledRest = (rest || raw)
    .split(" ")
    .filter(Boolean)
    .map((part, i, arr) => {
      const lower = part.toLowerCase();
      if (
        ["da", "de", "do", "das", "dos", "e"].includes(lower) &&
        arr.length > 1
      ) {
        return lower;
      }
      if (/^[ivxlcdm]+$/i.test(part) && part.length <= 4) {
        return part.toUpperCase();
      }
      if (/^\d+[a-z]?$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");

  if (!type) {
    return titledRest;
  }
  if (!rest) return type;
  return `${type} ${titledRest}`;
}

export function normalizeNumero(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const lower = stripAccents(raw).toLowerCase();
  if (["s/n", "sn", "sem numero", "sem número"].includes(lower)) return "S/N";
  return raw.replace(/\s+/g, " ");
}

export function normalizeUf(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw.length === 2) return raw;
  const map: Record<string, string> = {
    ACRE: "AC",
    ALAGOAS: "AL",
    AMAPA: "AP",
    AMAZONAS: "AM",
    BAHIA: "BA",
    CEARA: "CE",
    "DISTRITO FEDERAL": "DF",
    "ESPIRITO SANTO": "ES",
    GOIAS: "GO",
    MARANHAO: "MA",
    "MATO GROSSO": "MT",
    "MATO GROSSO DO SUL": "MS",
    "MINAS GERAIS": "MG",
    PARA: "PA",
    PARAIBA: "PB",
    PARANA: "PR",
    PERNAMBUCO: "PE",
    PIAUI: "PI",
    "RIO DE JANEIRO": "RJ",
    "RIO GRANDE DO NORTE": "RN",
    "RIO GRANDE DO SUL": "RS",
    RONDONIA: "RO",
    RORAIMA: "RR",
    "SANTA CATARINA": "SC",
    "SAO PAULO": "SP",
    SERGIPE: "SE",
    TOCANTINS: "TO",
  };
  return map[stripAccents(raw).toUpperCase()] ?? raw.slice(0, 2);
}

/**
 * Território composto no formato "Cidade/Comunidade".
 * A parte após `/` é o território (quilombo, comunidade, etc.) — opcional.
 */
export function parseTerritorioComposto(value: unknown): {
  cidade: string;
  territorio: string;
} {
  const raw = String(value ?? "").trim().replace(/\s*\/\s*/g, "/");
  if (!raw) return { cidade: "", territorio: "" };
  const idx = raw.indexOf("/");
  if (idx === -1) {
    return { cidade: "", territorio: normalizeAddressLine(raw) };
  }
  const left = raw.slice(0, idx).trim();
  const right = raw.slice(idx + 1).trim();
  return {
    cidade: normalizeAddressLine(left),
    territorio: normalizeAddressLine(right),
  };
}

/** Aplica split Cidade/Território quando o campo Território (ou Cidade) traz `/`. */
export function splitCidadeTerritorio(input: {
  Cidade?: unknown;
  Territorio?: unknown;
}): { Cidade: string; Territorio: string } {
  let cidade = normalizeAddressLine(input.Cidade);
  let territorio = String(input.Territorio ?? "").trim();

  if (territorio.includes("/")) {
    const parsed = parseTerritorioComposto(territorio);
    if (!cidade && parsed.cidade) cidade = parsed.cidade;
    territorio = parsed.territorio;
  } else if (cidade.includes("/")) {
    const parsed = parseTerritorioComposto(cidade);
    cidade = parsed.cidade;
    if (!territorio && parsed.territorio) territorio = parsed.territorio;
  } else {
    territorio = normalizeAddressLine(territorio);
  }

  return { Cidade: cidade, Territorio: territorio };
}

export function normalizeGenero(value: unknown): Genero | string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if ((GENEROS as readonly string[]).includes(raw)) return raw as Genero;

  const key = stripAccents(raw).toLowerCase();
  if (["m", "masc", "masculino", "homem", "male", "h"].includes(key)) {
    return "Masculino";
  }
  if (["f", "fem", "feminino", "mulher", "female"].includes(key)) {
    return "Feminino";
  }
  if (["nao-binario", "naobinario", "nb", "nonbinary", "nao binario"].includes(key)) {
    return "Não-binário";
  }
  if (["outro", "outros", "other"].includes(key)) return "Outro";
  if (
    ["prefiro nao informar", "nao informar", "ni", "ns", "prefer not"].includes(key)
  ) {
    return "Prefiro não informar";
  }
  return raw;
}

export function normalizeEtnia(value: unknown): Etnia | string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if ((ETNIAS as readonly string[]).includes(raw)) return raw as Etnia;

  const key = stripAccents(raw).toLowerCase();
  if (key.includes("branco") || key === "branca") return "Branca";
  if (key.includes("preto") || key === "preta" || key.includes("negro")) return "Preta";
  if (key.includes("pardo") || key === "parda") return "Parda";
  if (key.includes("amarelo") || key === "amarela" || key.includes("asiat")) {
    return "Amarela";
  }
  if (key.includes("indigen")) return "Indígena";
  if (key.includes("nao informar") || key.includes("prefiro")) {
    return "Prefiro não informar";
  }
  if (key.includes("parda") || key.includes("pardo")) return "Parda";
  return raw;
}

export function normalizeSimNao(value: unknown): "Sim" | "Não" {
  const key = stripAccents(String(value ?? ""))
    .trim()
    .toLowerCase();
  if (["1", "sim", "s", "true", "yes", "y"].includes(key)) return "Sim";
  if (key.startsWith("sim")) return "Sim";
  return "Não";
}

/**
 * Padroniza PCD / restrição alimentar: "Não" | "Sim" | "Sim, <detalhe>"
 */
export function normalizeSimComDetalhe(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "Não";

  const key = stripAccents(raw).toLowerCase();
  if (
    ["0", "nao", "n", "false", "no", "nenhuma", "nenhum", "sem", "-", "n/a", "na"].includes(
      key,
    )
  ) {
    return "Não";
  }
  if (["1", "sim", "s", "true", "yes", "y"].includes(key)) return "Sim";

  const simPrefix = raw.match(/^sim\s*[,:\-–]?\s*(.*)$/i);
  if (simPrefix) {
    const detail = (simPrefix[1] ?? "").trim();
    return detail ? `Sim, ${detail}` : "Sim";
  }

  return `Sim, ${raw}`;
}

export function normalizeFlag01(value: unknown): 0 | 1 {
  return normalizeSimNao(value) === "Sim" ||
    normalizeSimComDetalhe(value).toLowerCase().startsWith("sim")
    ? 1
    : 0;
}

export function parseFlexibleDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValid(value) ? value : null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    return isValid(d) ? d : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = parseISO(raw);
  if (isValid(iso)) return iso;

  // BR first; US (M/d) only when BR parse fails (e.g. month > 12 in middle slot)
  for (const fmt of [
    "dd/MM/yyyy",
    "d/M/yyyy",
    "yyyy-MM-dd",
    "dd-MM-yyyy",
    "M/d/yyyy",
    "MM/dd/yyyy",
  ]) {
    const d = parse(raw, fmt, new Date());
    if (isValid(d)) return d;
  }
  return null;
}

export function formatDateBR(date: Date | null): string {
  if (!date) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function calcAge(birth: Date | null, ref: Date = new Date()): number | null {
  if (!birth) return null;
  const age = differenceInYears(ref, birth);
  return age >= 0 && age < 150 ? age : null;
}

export function mapRawRowByHeaders(
  raw: Record<string, unknown>,
  context: BatchContext,
  mapping?: Record<string, import("@/lib/schema").SigaCulturalColumn>,
): Partial<SigaCulturalRow> {
  if (mapping) {
    return projectRowWithMapping(raw, mapping, context);
  }

  const auto: Record<string, import("@/lib/schema").SigaCulturalColumn> = {};
  const used = new Set<string>();
  for (const key of Object.keys(raw)) {
    const target = HEADER_SYNONYMS[normalizeHeaderKey(key)];
    if (!target || CONTEXT_COLUMNS.includes(target) || used.has(target)) continue;
    used.add(target);
    auto[key] = target;
  }
  return projectRowWithMapping(raw, auto, context);
}

export function normalizeRow(
  partial: Partial<SigaCulturalRow> | Record<string, unknown>,
  context?: BatchContext,
): SigaCulturalRow {
  const base = emptySigaCulturalRow(context);
  const merged = { ...base, ...partial } as Record<string, unknown>;

  if (context) {
    merged.id_projeto = context.id_projeto;
    merged.id_oficina = context.id_oficina;
    merged.PROPONENTE = context.PROPONENTE;
    merged.PRONAC = context.PRONAC;
    merged.Nome_projeto = context.Nome_projeto;
    merged.Identificacao_ano_projeto = context.Identificacao_ano_projeto;
    if (context.Nome_oficina) merged.Nome_oficina = context.Nome_oficina;
  }

  const birth = parseFlexibleDate(merged.Data_nascimento);
  const insc = parseFlexibleDate(merged.Data_inscricao) ?? new Date();
  const { Cidade: cidadeSplit, Territorio: territorioSplit } =
    splitCidadeTerritorio({
      Cidade: merged.Cidade,
      Territorio: merged.Territorio,
    });
  const enriched = enrichCidadeEstado({
    cidade: cidadeSplit,
    estado: String(merged.Estado ?? ""),
    territorio: territorioSplit,
  });

  const candidate = {
    ...merged,
    PROPONENTE: String(merged.PROPONENTE ?? "").trim(),
    PRONAC: String(merged.PRONAC ?? "").trim(),
    Nome_projeto: String(merged.Nome_projeto ?? "").trim(),
    Nome_oficina: String(merged.Nome_oficina ?? "").trim(),
    Nome: normalizePersonName(merged.Nome),
    Apelido: String(merged.Apelido ?? "").trim(),
    CPF: normalizeCpf(merged.CPF),
    CEP: normalizeCep(merged.CEP),
    Telefone: normalizePhone(merged.Telefone),
    "E-mail": normalizeEmail(merged["E-mail"]),
    Lougradouro: normalizeLogradouro(merged.Lougradouro),
    Numero: normalizeNumero(merged.Numero),
    Complemento: String(merged.Complemento ?? "").trim(),
    Bairro: normalizeAddressLine(merged.Bairro),
    Cidade: enriched.cidade,
    Estado: enriched.estado,
    Genero: normalizeGenero(merged.Genero),
    Etnia: normalizeEtnia(merged.Etnia),
    Possui_deficiencia: normalizeSimComDetalhe(merged.Possui_deficiencia),
    Redesocial: String(merged.Redesocial ?? "").trim().replace(/^@+/, "@"),
    Escolaridade: String(merged.Escolaridade ?? "").trim(),
    Territorio: enriched.territorio,
    RestricaoAlimentar: normalizeSimComDetalhe(merged.RestricaoAlimentar),
    Ficousabendo: String(merged.Ficousabendo ?? "").trim(),
    Data_nascimento:
      formatDateBR(birth) || String(merged.Data_nascimento ?? "").trim(),
    Data_inscricao:
      formatDateBR(parseFlexibleDate(merged.Data_inscricao)) ||
      formatDateBR(insc) ||
      String(merged.Data_inscricao ?? "").trim(),
    Identificacao_ano_projeto: normalizeAnoProjeto(
      merged.Identificacao_ano_projeto,
    ),
    idade_atual: calcAge(birth, new Date()),
    idade_inscricao: calcAge(birth, insc),
    Inscritos:
      merged.Inscritos === null ||
      merged.Inscritos === undefined ||
      merged.Inscritos === ""
        ? 1
        : Number(merged.Inscritos) || 1,
    Selecionados: normalizeFlag01(merged.Selecionados),
    Participantes: normalizeFlag01(merged.Participantes),
    Certificado: normalizeFlag01(merged.Certificado),
  };

  return SigaCulturalRowSchema.parse(candidate) as SigaCulturalRow;
}

export function normalizeRawRows(
  rawRows: Record<string, unknown>[],
  context: BatchContext,
): SigaCulturalRow[] {
  return rawRows.map((raw) => {
    const mapped = mapRawRowByHeaders(raw, context);
    return normalizeRow(mapped, context);
  });
}

export function formatRowsWithMapping(
  rawRows: Record<string, unknown>[],
  mapping: Record<string, import("@/lib/schema").SigaCulturalColumn>,
  context: BatchContext,
): SigaCulturalRow[] {
  return rawRows.map((raw) =>
    normalizeRow(projectRowWithMapping(raw, mapping, context), context),
  );
}
