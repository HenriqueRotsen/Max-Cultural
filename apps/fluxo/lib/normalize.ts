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

/** Evita notação científica (Excel) e decimais em campos numéricos. */
export function coerceDigitSource(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(Math.abs(value)).toString();
  }
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d+\.?\d*e[+\-]?\d+$/i.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.trunc(Math.abs(n)).toString();
  }
  // "52998224725.0" / "31.988519092" raros — só dígitos depois
  return raw;
}

export function digitsOnly(value: unknown): string {
  return coerceDigitSource(value).replace(/\D/g, "");
}

export function normalizeCpf(value: unknown): string {
  let d = digitsOnly(value);
  // Excel costuma cortar zeros à esquerda (9–10 dígitos → completa para 11)
  if (d.length >= 8 && d.length < 11) d = d.padStart(11, "0");
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

/**
 * Telefone BR: só dígitos (DDD + número).
 * Remove DDI 55 e zero de troncal; fica 10 (fixo) ou 11 (celular 9xxxx-xxxx).
 */
export function normalizePhone(value: unknown): string {
  let d = digitsOnly(value);
  // +55 / 55…
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    d = d.slice(2);
  }
  // 0 + DDD + número (ex.: 031988519092)
  if ((d.length === 11 || d.length === 12) && d.startsWith("0")) {
    d = d.slice(1);
  }
  // DDI 55 com zero: 55031988519092
  if (d.length === 14 && d.startsWith("550")) {
    d = d.slice(3);
  } else if (d.length === 13 && d.startsWith("55")) {
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

function isReasonableYear(year: number): boolean {
  const now = new Date().getFullYear();
  return year >= 1900 && year <= now + 1;
}

/** Limites de ano para data de nascimento: [atual−100, atual−17], sempre 4 dígitos. */
export function birthYearBounds(ref: Date = new Date()): {
  min: number;
  max: number;
} {
  const now = ref.getFullYear();
  return { min: now - 100, max: now - 17 };
}

export function isBirthYear(year: number, ref: Date = new Date()): boolean {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
  const { min, max } = birthYearBounds(ref);
  return year >= min && year <= max;
}

/** Ano com 2 dígitos → 4 dígitos, priorizando idade 0–120. */
export function expandTwoDigitYear(yy: number, ref: Date = new Date()): number {
  if (!Number.isInteger(yy) || yy < 0 || yy > 99) return yy;
  const now = ref.getFullYear();
  let year = 2000 + yy;
  if (year > now) year -= 100;
  if (now - year > 120) year += 100;
  return year;
}

function makeCivilDate(
  day: number,
  month: number,
  year: number,
): Date | null {
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }
  if (!isReasonableYear(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (
    !isValid(d) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function parseExcelSerial(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(excelEpoch.getTime() + serial * 86400000);
  if (!isValid(d) || !isReasonableYear(d.getUTCFullYear())) return null;
  // Normaliza para data civil local (sem fuso)
  return makeCivilDate(
    d.getUTCDate(),
    d.getUTCMonth() + 1,
    d.getUTCFullYear(),
  );
}

/** Interpreta só dígitos como data BR (com ou sem separadores na origem). */
function parseDigitDate(digits: string): Date | null {
  if (!/^\d+$/.test(digits)) return null;

  if (digits.length === 8) {
    // DDMMYYYY
    const br = makeCivilDate(
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4)),
      Number(digits.slice(4, 8)),
    );
    if (br) return br;
    // YYYYMMDD
    return makeCivilDate(
      Number(digits.slice(6, 8)),
      Number(digits.slice(4, 6)),
      Number(digits.slice(0, 4)),
    );
  }

  if (digits.length === 6) {
    // DDMMYY
    return makeCivilDate(
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 4)),
      expandTwoDigitYear(Number(digits.slice(4, 6))),
    );
  }

  if (digits.length === 7) {
    // D + MM + YYYY  (ex.: 4022001 → 4/02/2001)
    const a = makeCivilDate(
      Number(digits.slice(0, 1)),
      Number(digits.slice(1, 3)),
      Number(digits.slice(3, 7)),
    );
    if (a) return a;
    // DD + M + YYYY
    return makeCivilDate(
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 3)),
      Number(digits.slice(3, 7)),
    );
  }

  if (digits.length === 5) {
    // D + MM + YY  (ex.: 40201 → 4/02/01)
    const a = makeCivilDate(
      Number(digits.slice(0, 1)),
      Number(digits.slice(1, 3)),
      expandTwoDigitYear(Number(digits.slice(3, 5))),
    );
    if (a) return a;
    // DD + M + YY
    return makeCivilDate(
      Number(digits.slice(0, 2)),
      Number(digits.slice(2, 3)),
      expandTwoDigitYear(Number(digits.slice(3, 5))),
    );
  }

  // Serial Excel em texto (ex.: "44927")
  if (digits.length >= 4 && digits.length <= 5) {
    return parseExcelSerial(Number(digits));
  }

  return null;
}

export function parseFlexibleDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return isValid(value) && isReasonableYear(value.getFullYear()) ? value : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Serial Excel ou timestamp-like pequeno
    if (value > 1000 && value < 80000) return parseExcelSerial(value);
    const asDate = new Date(value);
    return isValid(asDate) && isReasonableYear(asDate.getFullYear())
      ? asDate
      : null;
  }

  const rawOriginal = String(value).trim();
  if (!rawOriginal) return null;

  // Carimbo Google Forms / datetime: "28/09/2026 14:32:10" → usa só a data
  const raw = rawOriginal
    .replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[AaPp][Mm])?.*$/, "")
    .trim();
  if (!raw) return null;

  // Dia/mês sem ano (ex.: 04/02, 4-2, 0402) → campo deve ficar em branco
  if (/^\d{1,2}[/\-. ]+\d{1,2}$/.test(raw)) return null;
  if (/^\d{3,4}$/.test(raw)) return null;

  // ISO explícito (yyyy-mm-dd…) — evita parseISO em strings ambíguas
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = parseISO(raw.slice(0, 10));
    if (isValid(iso) && isReasonableYear(iso.getFullYear())) {
      return makeCivilDate(
        iso.getUTCDate(),
        iso.getUTCMonth() + 1,
        iso.getUTCFullYear(),
      ) ?? iso;
    }
  }

  // d/m/y com /, ., - ou espaço (4/2/01, 04.02.2001, 4-2-2001…)
  const sep = raw.match(
    /^(\d{1,2})[/\-. ]+(\d{1,2})[/\-. ]+(\d{2}|\d{4})$/,
  );
  if (sep) {
    const a = Number(sep[1]);
    const b = Number(sep[2]);
    const yearRaw = sep[3]!;
    const year =
      yearRaw.length === 2
        ? expandTwoDigitYear(Number(yearRaw))
        : Number(yearRaw);

    // Preferência BR: dia/mês/ano
    const br = makeCivilDate(a, b, year);
    if (br) return br;

    // Fallback US só quando o 1º slot não pode ser dia BR (mês > 12 no meio)
    if (a <= 12 && b > 12) {
      return makeCivilDate(b, a, year);
    }
    return null;
  }

  // Sem separadores (ou misturados já reduzidos a dígitos)
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 5 && digits.length <= 8) {
    const fromDigits = parseDigitDate(digits);
    if (fromDigits) return fromDigits;
  }

  // Último recurso: formatos date-fns com ano razoável
  for (const fmt of [
    "dd/MM/yyyy",
    "d/M/yyyy",
    "dd/MM/yy",
    "d/M/yy",
    "yyyy-MM-dd",
    "dd-MM-yyyy",
    "d-M-yyyy",
    "dd.MM.yyyy",
    "d.M.yyyy",
    "dd.MM.yy",
    "d.M.yy",
  ]) {
    const d = parse(raw, fmt, new Date());
    if (!isValid(d)) continue;
    let year = d.getFullYear();
    // date-fns com yy às vezes devolve 0001–0099
    if (year >= 0 && year < 100) year = expandTwoDigitYear(year);
    const fixed = makeCivilDate(d.getDate(), d.getMonth() + 1, year);
    if (fixed) return fixed;
  }

  return null;
}

/**
 * Data de nascimento: exige dia/mês/ano (ano com 4 dígitos) e idade entre 17 e 100 anos.
 * Fora disso → null (campo em branco).
 */
export function parseBirthDate(
  value: unknown,
  ref: Date = new Date(),
): Date | null {
  const d = parseFlexibleDate(value);
  if (!d) return null;
  if (!isBirthYear(d.getFullYear(), ref)) return null;
  return d;
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

  const birth = parseBirthDate(merged.Data_nascimento);
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
    Data_nascimento: formatDateBR(birth),
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
