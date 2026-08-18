import {
  SIGACULTURAL_COLUMNS,
  type BatchContext,
  type SigaCulturalColumn,
  type SigaCulturalRow,
} from "@/lib/schema";
import { isFullAddressHeader } from "@/lib/address-parse";

/** Sinônimos de cabeçalho → coluna oficial */
export const HEADER_SYNONYMS: Record<string, SigaCulturalColumn> = {
  id_projeto: "id_projeto",
  idprojeto: "id_projeto",
  projeto: "id_projeto",
  id_oficina: "id_oficina",
  idoficina: "id_oficina",
  oficina: "id_oficina",
  proponente: "PROPONENTE",
  pronac: "PRONAC",
  nome_projeto: "Nome_projeto",
  nomeprojeto: "Nome_projeto",
  projeto_nome: "Nome_projeto",
  identificacao_ano_projeto: "Identificacao_ano_projeto",
  ano_projeto: "Identificacao_ano_projeto",
  ano: "Identificacao_ano_projeto",
  nome_oficina: "Nome_oficina",
  nomeoficina: "Nome_oficina",
  data_inscricao: "Data_inscricao",
  datainscricao: "Data_inscricao",
  inscricao: "Data_inscricao",
  nome: "Nome",
  nome_completo: "Nome",
  nomecompleto: "Nome",
  apelido: "Apelido",
  cpf: "CPF",
  data_nascimento: "Data_nascimento",
  datanascimento: "Data_nascimento",
  nascimento: "Data_nascimento",
  genero: "Genero",
  sexo: "Genero",
  etnia: "Etnia",
  raca: "Etnia",
  "raça": "Etnia",
  cor: "Etnia",
  email: "E-mail",
  "e-mail": "E-mail",
  telefone: "Telefone",
  celular: "Telefone",
  fone: "Telefone",
  whatsapp: "Telefone",
  possui_deficiencia: "Possui_deficiencia",
  deficiencia: "Possui_deficiencia",
  pcd: "Possui_deficiencia",
  restricaoalimentar: "RestricaoAlimentar",
  restricao_alimentar: "RestricaoAlimentar",
  alimentacao: "RestricaoAlimentar",
  ficousabendo: "Ficousabendo",
  como_soube: "Ficousabendo",
  divulgacao: "Ficousabendo",
  lougradouro: "Lougradouro",
  logradouro: "Lougradouro",
  endereco: "Lougradouro",
  endereço: "Lougradouro",
  endereco_completo: "Lougradouro",
  endereço_completo: "Lougradouro",
  endereco_residencial: "Lougradouro",
  endereço_residencial: "Lougradouro",
  endereco_com_cep: "Lougradouro",
  seu_endereco: "Lougradouro",
  rua: "Lougradouro",
  numero: "Numero",
  número: "Numero",
  num: "Numero",
  complemento: "Complemento",
  bairro: "Bairro",
  cep: "CEP",
  cidade: "Cidade",
  municipio: "Cidade",
  município: "Cidade",
  estado: "Estado",
  uf: "Estado",
  redesocial: "Redesocial",
  rede_social: "Redesocial",
  instagram: "Redesocial",
  escolaridade: "Escolaridade",
  idade_atual: "idade_atual",
  idade: "idade_atual",
  idade_inscricao: "idade_inscricao",
  territorio: "Territorio",
  território: "Territorio",
  quilombo: "Territorio",
  comunidade: "Territorio",
  assentamento: "Territorio",
  regional: "Territorio",
  regionais: "Territorio",
  territorio_comunidade: "Territorio",
  inscritos: "Inscritos",
  selecionados: "Selecionados",
  selecionado: "Selecionados",
  participantes: "Participantes",
  participante: "Participantes",
  certificado: "Certificado",
  // extras comuns em formulários BR
  nome_social: "Apelido",
  doc: "CPF",
  documento: "CPF",
  cpf_cnpj: "CPF",
  dt_nasc: "Data_nascimento",
  dt_nascimento: "Data_nascimento",
  dtnascimento: "Data_nascimento",
  birth: "Data_nascimento",
  birthday: "Data_nascimento",
  gender: "Genero",
  identity: "Genero",
  race: "Etnia",
  cor_raca: "Etnia",
  mail: "E-mail",
  e_mail: "E-mail",
  tel: "Telefone",
  celular_whatsapp: "Telefone",
  phone: "Telefone",
  mobile: "Telefone",
  pcd_sim_nao: "Possui_deficiencia",
  tem_deficiencia: "Possui_deficiencia",
  alergia: "RestricaoAlimentar",
  restricao: "RestricaoAlimentar",
  como_conheceu: "Ficousabendo",
  midia: "Ficousabendo",
  street: "Lougradouro",
  av: "Lougradouro",
  avenida: "Lougradouro",
  n: "Numero",
  no: "Numero",
  nro: "Numero",
  apto: "Complemento",
  apartamento: "Complemento",
  district: "Bairro",
  zip: "CEP",
  zipcode: "CEP",
  zip_code: "CEP",
  city: "Cidade",
  state: "Estado",
  social: "Redesocial",
  ig: "Redesocial",
  insta: "Redesocial",
  schooling: "Escolaridade",
  formacao: "Escolaridade",
  age: "idade_atual",
  region: "Territorio",
  zona: "Territorio",
  community: "Territorio",
  settlement: "Territorio",
  aprovado: "Selecionados",
  presente: "Participantes",
  concluiu: "Certificado",
  certificado_emitido: "Certificado",
};

/** Colunas preenchidas pelo contexto do lote — não precisam vir da planilha */
export const CONTEXT_COLUMNS: SigaCulturalColumn[] = [
  "id_projeto",
  "id_oficina",
  "PROPONENTE",
  "PRONAC",
  "Nome_projeto",
  "Identificacao_ano_projeto",
];

/** 7 colunas de lote (contexto + oficina) — ocultas na prévia */
export const LOTE_CONTEXT_COLUMNS: SigaCulturalColumn[] = [
  ...CONTEXT_COLUMNS,
  "Nome_oficina",
];

/** 28 colunas de dados da pessoa/status (35 − 7) — sempre na prévia */
export const PERSON_COLUMNS: SigaCulturalColumn[] = SIGACULTURAL_COLUMNS.filter(
  (c) => !LOTE_CONTEXT_COLUMNS.includes(c),
);

/** Campos essenciais da pessoa na importação (devem vir da planilha) */
export const REQUIRED_PERSON_COLUMNS: SigaCulturalColumn[] = ["Nome", "CPF"];

/** Campos recomendados (melhoram a base, mas não bloqueiam) */
export const RECOMMENDED_PERSON_COLUMNS: SigaCulturalColumn[] = [
  "Data_nascimento",
  "E-mail",
  "Telefone",
  "Genero",
  "Etnia",
  "Cidade",
  "Estado",
];

export type ColumnMappingEntry = {
  source: string;
  target: SigaCulturalColumn | null;
  confidence: "high" | "medium" | "low" | "none";
  method: "heuristic" | "ai" | "ignored";
};

export type ColumnMappingResult = {
  entries: ColumnMappingEntry[];
  /** source header → official column (somente interessantes) */
  mapping: Record<string, SigaCulturalColumn>;
  ignoredSources: string[];
  mappedTargets: SigaCulturalColumn[];
  usedAi: boolean;
  aiError?: string;
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeHeaderKey(key: string): string {
  return stripAccents(String(key))
    .trim()
    .toLowerCase()
    .replace(/[?!:;,()[\]{}"'`´]/g, " ")
    .replace(/[\s./\\+-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

/**
 * Match por inclusão: "CPF do aluno" → CPF, "e-mail pessoal" → E-mail
 */
function matchHeaderByIncludes(key: string): SigaCulturalColumn | null {
  // perguntas longas de formulário (Google Forms etc.)
  if (/carimbo|timestamp|hora_de_envio|submission/.test(key)) return null;
  if (/qual_oficina|inscrever.*oficina|oficina_desej/.test(key)) return null;

  const rules: Array<[RegExp, SigaCulturalColumn]> = [
    [/(^|_)cpf($|_)/, "CPF"],
    [/(^|_)e_?mail($|_)|correo/, "E-mail"],
    [/(telefone|celular|whatsapp|fone|phone|mobile)/, "Telefone"],
    // endereço completo antes de cep/bairro/cidade/numero soltos
    [
      /(endereco_completo|endereco_residencial|endereco_com_cep|full_?address)/,
      "Lougradouro",
    ],
    [
      /(endereco.*bairro|endereco.*cidade|endereco.*cep|endereco.*rua.*numero)/,
      "Lougradouro",
    ],
    [/(logradouro|lougradouro|(^|_)endereco($|_)|(^|_)rua($|_)|avenida)/, "Lougradouro"],
    [/(^|_)cep($|_)/, "CEP"],
    [/zip.?code/, "CEP"],
    [/(bairro|district)/, "Bairro"],
    [/(cidade|municipio|city)/, "Cidade"],
    [/(^|_)(estado|uf)($|_)/, "Estado"],
    [/(genero|sexo|gender|identidade_de_genero)/, "Genero"],
    [/(etnia|raca|cor_raca|cor_ou_raca)/, "Etnia"],
    [/(nascimento|dt_?nasc|birthday|data_de_nascimento)/, "Data_nascimento"],
    [/(data_de_inscricao|dt_?insc)/, "Data_inscricao"],
    [/(deficiencia|pcd|pessoa_com_deficiencia)/, "Possui_deficiencia"],
    [/(aliment|alergia|restricao)/, "RestricaoAlimentar"],
    [/(escolaridade|formacao|schooling)/, "Escolaridade"],
    [/(instagram|facebook|rede_?social|redesocial|@)/, "Redesocial"],
    [/(territorio|zona|quilombo|comunidade|assentamento|regional)/, "Territorio"],
    [/(apelido|nome_social)/, "Apelido"],
    [/(nome_completo|(^|_)nome($|_))/, "Nome"],
    [/(^|_)(numero|nro)($|_)/, "Numero"],
    [/(complemento)/, "Complemento"],
    [/selecionad/, "Selecionados"],
    [/participant/, "Participantes"],
    [/certificad/, "Certificado"],
    [/(como_ficou_sabendo|ficou_sabendo|como_soube|como_conheceu)/, "Ficousabendo"],
  ];

  for (const [re, col] of rules) {
    if (re.test(key)) return col;
  }
  return null;
}

function digitsOnlyLocal(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Inferência por amostra de valores (quando o cabeçalho é genérico).
 */
export function inferTargetFromSamples(
  values: unknown[],
): SigaCulturalColumn | null {
  const nonEmpty = values
    .map((v) => String(v ?? "").trim())
    .filter((v) => v !== "");
  if (nonEmpty.length === 0) return null;

  const sample = nonEmpty.slice(0, 8);
  const digitLens = sample.map((v) => digitsOnlyLocal(v).length);
  const avgDigitLen =
    digitLens.reduce((a, b) => a + b, 0) / Math.max(digitLens.length, 1);

  if (digitLens.filter((n) => n === 11).length >= Math.ceil(sample.length * 0.6)) {
    return "CPF";
  }
  if (digitLens.filter((n) => n === 8).length >= Math.ceil(sample.length * 0.6)) {
    return "CEP";
  }
  if (
    digitLens.filter((n) => n === 10 || n === 11).length >=
      Math.ceil(sample.length * 0.6) &&
    avgDigitLen >= 10
  ) {
    return "Telefone";
  }
  if (
    sample.filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).length >=
    Math.ceil(sample.length * 0.5)
  ) {
    return "E-mail";
  }
  if (sample.every((v) => /^[A-Za-z]{2}$/.test(v))) {
    return "Estado";
  }
  if (
    sample.filter((v) => looksLikeFullAddressSample(v)).length >=
    Math.ceil(sample.length * 0.5)
  ) {
    return "Lougradouro";
  }
  if (
    sample.filter(
      (v) =>
        /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v) ||
        /^\d{4}-\d{2}-\d{2}/.test(v),
    ).length >= Math.ceil(sample.length * 0.5)
  ) {
    return "Data_nascimento";
  }

  return null;
}

function looksLikeFullAddressSample(value: string): boolean {
  if (value.length < 12) return false;
  if (/\d{5}-?\d{3}/.test(value)) return true;
  if ((value.match(/,/g) ?? []).length >= 2) return true;
  if (/\b(rua|av\.?|avenida|travessa|bairro|cep)\b/i.test(value) && /,/.test(value)) {
    return true;
  }
  return false;
}

/**
 * Mapeamento heurístico máximo: sinônimos + inclusão + amostra de valores.
 * Não usa IA.
 */
export function mapHeadersHeuristic(
  headers: string[],
  sampleRows: Record<string, unknown>[] = [],
): ColumnMappingResult {
  const usedTargets = new Set<SigaCulturalColumn>();
  const mapping: Record<string, SigaCulturalColumn> = {};
  const entries: ColumnMappingEntry[] = [];
  const entryBySource = new Map<string, number>();

  function setEntry(entry: ColumnMappingEntry) {
    const idx = entryBySource.get(entry.source);
    if (idx == null) {
      entryBySource.set(entry.source, entries.length);
      entries.push(entry);
    } else {
      entries[idx] = entry;
    }
    if (entry.target) {
      mapping[entry.source] = entry.target;
    } else {
      delete mapping[entry.source];
    }
  }

  // Pass 0: "Endereço completo (...)" ganha Lougradouro antes de "Rua"/"CEP" soltos
  for (const source of headers) {
    if (!isFullAddressHeader(source)) continue;
    if (usedTargets.has("Lougradouro")) continue;
    usedTargets.add("Lougradouro");
    setEntry({
      source,
      target: "Lougradouro",
      confidence: "high",
      method: "heuristic",
    });
  }

  // Pass 1: sinônimos exatos / includes
  for (const source of headers) {
    if (entryBySource.has(source) && mapping[source]) continue;

    const key = normalizeHeaderKey(source);
    let target = HEADER_SYNONYMS[key] ?? matchHeaderByIncludes(key);
    const confidence: ColumnMappingEntry["confidence"] = HEADER_SYNONYMS[key]
      ? "high"
      : target
        ? "medium"
        : "none";

    if (target && CONTEXT_COLUMNS.includes(target)) {
      setEntry({ source, target: null, confidence: "none", method: "ignored" });
      continue;
    }

    // Não deixar "rua/número/cep" no enunciado do endereço completo roubar outros targets
    if (isFullAddressHeader(source)) {
      if (!mapping[source]) {
        setEntry({
          source,
          target: null,
          confidence: "none",
          method: "ignored",
        });
      }
      continue;
    }

    if (target && !usedTargets.has(target)) {
      usedTargets.add(target);
      setEntry({ source, target, confidence, method: "heuristic" });
    } else {
      setEntry({ source, target: null, confidence: "none", method: "ignored" });
    }
  }

  // Pass 2: inferência por valores só para colunas ainda ignoradas
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.target) continue;
    if (isFullAddressHeader(entry.source)) continue;
    const samples = sampleRows.map((r) => r[entry.source]);
    const inferred = inferTargetFromSamples(samples);
    if (
      inferred &&
      !usedTargets.has(inferred) &&
      !CONTEXT_COLUMNS.includes(inferred)
    ) {
      usedTargets.add(inferred);
      entries[i] = {
        source: entry.source,
        target: inferred,
        confidence: "low",
        method: "heuristic",
      };
      mapping[entry.source] = inferred;
    }
  }

  // Garante uma entry para cada header
  for (const source of headers) {
    if (!entryBySource.has(source)) {
      setEntry({ source, target: null, confidence: "none", method: "ignored" });
    }
  }

  return {
    entries,
    mapping,
    ignoredSources: entries.filter((e) => !e.target).map((e) => e.source),
    mappedTargets: Object.values(mapping),
    usedAi: false,
  };
}

/**
 * Aplica o mapeamento: projeta só colunas interessantes + contexto do lote.
 */
export function projectRowWithMapping(
  raw: Record<string, unknown>,
  mapping: Record<string, SigaCulturalColumn>,
  context: BatchContext,
): Partial<SigaCulturalRow> {
  const projected: Partial<SigaCulturalRow> = {
    id_projeto: context.id_projeto,
    id_oficina: context.id_oficina,
    PROPONENTE: context.PROPONENTE,
    PRONAC: context.PRONAC,
    Nome_projeto: context.Nome_projeto,
    Identificacao_ano_projeto: context.Identificacao_ano_projeto,
    Nome_oficina: context.Nome_oficina ?? "",
  };

  for (const [source, target] of Object.entries(mapping)) {
    if (CONTEXT_COLUMNS.includes(target)) continue;
    if (source in raw) {
      (projected as Record<string, unknown>)[target] = raw[source];
    }
  }

  return projected;
}

/** Colunas da prévia: sempre as 28 de dados (sem as 7 de contexto do lote) */
export function previewColumnsFromMapping(
  _mappedTargets?: SigaCulturalColumn[],
): SigaCulturalColumn[] {
  return [...PERSON_COLUMNS];
}

export function mergeAiMapping(
  base: ColumnMappingResult,
  aiMap: Record<string, string | null>,
): ColumnMappingResult {
  const usedTargets = new Set<SigaCulturalColumn>(Object.values(base.mapping));
  const mapping = { ...base.mapping };
  const entries = base.entries.map((entry) => {
    if (entry.target) return entry;

    const suggested = aiMap[entry.source];
    if (!suggested || suggested === "null" || suggested === "") {
      return entry;
    }

    const target = SIGACULTURAL_COLUMNS.find((c) => c === suggested);
    if (!target) return entry;
    if (CONTEXT_COLUMNS.includes(target)) return entry;
    if (usedTargets.has(target)) return entry;

    usedTargets.add(target);
    mapping[entry.source] = target;
    return {
      source: entry.source,
      target,
      confidence: "medium" as const,
      method: "ai" as const,
    };
  });

  return {
    entries,
    mapping,
    ignoredSources: entries.filter((e) => !e.target).map((e) => e.source),
    mappedTargets: Object.values(mapping),
    usedAi: true,
    aiError: base.aiError,
  };
}
