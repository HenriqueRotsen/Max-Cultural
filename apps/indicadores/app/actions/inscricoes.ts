"use server";

import { requirePermission } from "@/lib/auth";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { checkInscricaoRateLimit, inscricaoRateLimitRequired } from "@/lib/rate-limit";
import { turnstileRequired, verifyTurnstileToken } from "@/lib/turnstile";
import {
  assertDataAccess,
  inscricaoWhereFromScope,
  resolveDataScope,
} from "@/lib/data-scope";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  resolveColumnMapping,
  formatMappedBatch,
  reprocessValuesWithAi,
  expandFullAddressesWithAi,
  BATCH_SIZE,
} from "@/lib/ollama";
import type { ColumnMappingResult } from "@/lib/column-map";
import { previewColumnsFromMapping } from "@/lib/column-map";
import {
  normalizeRow,
  normalizeCpf,
  normalizeCep,
  normalizePhone,
  extractProjectYear,
  dedupeNormalizedInscricaoRows,
} from "@/lib/normalize";
import {
  inscricaoOrderBy,
  parseInscricaoSort,
  parseSortDir,
} from "@/lib/table-sort";
import {
  SigaCulturalRowSchema,
  rowToPrisma,
  prismaToRow,
  type BatchContext,
  type SigaCulturalColumn,
  type SigaCulturalRow,
} from "@/lib/schema";
import { Prisma } from "@prisma/client";
import Papa from "papaparse";
import * as XLSX from "@e965/xlsx";
import {
  aggregateSocio,
  andSocioCohort,
  type SocioBreakdown,
  type SocioCohort,
} from "@/lib/socio";
import { agruparProponentes, proponenteVariantes } from "@/lib/inscricao-filters";
import { chaveCpf, cpfsUnicosDoFiltro, type CpfsUnicos } from "@/lib/cpfs-unicos";
import {
  listContextosPanoramaAction,
  type ProgramaListItem,
} from "@/app/actions/programa";

export type ParseResult = {
  rows: Record<string, unknown>[];
  headers: string[];
  count: number;
};

function sheetToObjects(buffer: ArrayBuffer, filename: string): ParseResult {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    const rows = (parsed.data ?? []).filter((r) =>
      Object.values(r).some((v) => String(v ?? "").trim() !== ""),
    );
    return {
      rows,
      headers: parsed.meta.fields ?? [],
      count: rows.length,
    };
  }

  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], headers: [], count: 0 };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const filtered = rows.filter((r) =>
    Object.values(r).some((v) => String(v ?? "").trim() !== ""),
  );
  const headers = filtered[0] ? Object.keys(filtered[0]) : [];
  return { rows: filtered, headers, count: filtered.length };
}

export async function parseSpreadsheetAction(formData: FormData): Promise<ParseResult> {
  await requirePermission("import:write");
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Arquivo não enviado");
  }
  const buffer = await file.arrayBuffer();
  return sheetToObjects(buffer, file.name);
}

export type MapColumnsInput = {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  /** Último caso: refinar cabeçalhos sem match com Ollama */
  useAi?: boolean;
};

export async function mapColumnsAction(
  input: MapColumnsInput,
): Promise<ColumnMappingResult & { previewColumns: SigaCulturalColumn[] }> {
  await requirePermission("import:write");
  const result = await resolveColumnMapping(input.headers, input.sampleRows, {
    useAi: input.useAi === true,
  });
  return {
    ...result,
    previewColumns: previewColumnsFromMapping(result.mappedTargets),
  };
}

export type ProcessMappedInput = {
  rawRows: Record<string, unknown>[];
  mapping: Record<string, SigaCulturalColumn>;
  context: BatchContext;
  offset?: number;
};

export type ProcessMappedResult = {
  rows: SigaCulturalRow[];
  offset: number;
  batchSize: number;
  processedCount: number;
};

/** Formata apenas colunas mapeadas (sem reenviar a planilha inteira à IA). */
export async function processMappedRowsAction(
  input: ProcessMappedInput,
): Promise<ProcessMappedResult> {
  await requirePermission("import:write");
  const offset = input.offset ?? 0;
  return formatMappedBatch(
    input.rawRows,
    input.mapping,
    input.context,
    offset,
    BATCH_SIZE,
  );
}

export async function reprocessValuesAiAction(input: {
  rows: SigaCulturalRow[];
  columns: SigaCulturalColumn[];
  context: BatchContext;
}): Promise<{ rows: SigaCulturalRow[] }> {
  await requirePermission("import:write");
  const rows = await reprocessValuesWithAi(
    input.rows,
    input.columns,
    input.context,
  );
  return { rows };
}

/** Divide endereços completos (ex.: Google Forms) via IA. */
export async function expandAddressesAiAction(input: {
  rows: SigaCulturalRow[];
  context: BatchContext;
}): Promise<{ rows: SigaCulturalRow[]; expanded: number; error?: string }> {
  await requirePermission("import:write");
  return expandFullAddressesWithAi(input.rows, input.context);
}

/** @deprecated prefer mapColumnsAction + processMappedRowsAction */
export async function processWithOllamaAction(input: {
  rawRows: Record<string, unknown>[];
  context: BatchContext;
  offset?: number;
  mapping?: Record<string, SigaCulturalColumn>;
}): Promise<ProcessMappedResult & { usedFallback?: boolean; error?: string }> {
  await requirePermission("import:write");
  const offset = input.offset ?? 0;

  let mapping = input.mapping;
  if (!mapping) {
    const headers = input.rawRows[0] ? Object.keys(input.rawRows[0]) : [];
    const resolved = await resolveColumnMapping(headers, input.rawRows.slice(0, 5), {
      useAi: false,
    });
    mapping = resolved.mapping;
  }

  const result = formatMappedBatch(
    input.rawRows,
    mapping,
    input.context,
    offset,
    BATCH_SIZE,
  );
  return result;
}

export async function confirmImportAction(
  rows: SigaCulturalRow[],
  meta?: { contextoId?: string; nomeContexto?: string },
): Promise<{
  inserted: number;
}> {
  const user = await requirePermission("import:write");
  const sample = rows[0];
  if (sample) {
    const ok = await assertDataAccess(
      user.id,
      {
        contextoId: meta?.contextoId,
        idProjeto: sample.id_projeto,
        idAcao: sample.id_oficina,
      },
      { write: true },
    );
    if (!ok) throw new Error("Ação fora do seu escopo de dados.");
  }
  const normalized = dedupeNormalizedInscricaoRows(
    rows.map((row) =>
      SigaCulturalRowSchema.parse(normalizeRow(row)) as SigaCulturalRow,
    ),
  );

  const data = normalized.map((row) =>
    rowToPrisma(row, {
      contextoId: meta?.contextoId,
      nomeContexto: meta?.nomeContexto,
    }),
  );
  const result = await prisma.inscricao.createMany({ data });
  await writeAuditLog({
    actorUserId: user.id,
    action: "import.confirmed",
    meta: { inserted: result.count, acao: sample?.id_oficina },
  });
  return { inserted: result.count };
}

export async function updateInscricaoAction(input: {
  id: string;
  row: Partial<SigaCulturalRow>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission("inscricoes:write");
  try {
    const existing = await prisma.inscricao.findUnique({ where: { id: input.id } });
    if (!existing) {
      return { ok: false, error: "Registro não encontrado." };
    }
    const allowed = await assertDataAccess(
      user.id,
      {
        contextoId: existing.contextoId,
        idProjeto: existing.idProjeto,
        idAcao: existing.idAcao,
      },
      { write: true },
    );
    if (!allowed) return { ok: false, error: "Fora do seu escopo de dados." };

    const current = prismaToRow(existing);
    const merged = normalizeRow({ ...current, ...input.row });
    const parsed = SigaCulturalRowSchema.parse(merged) as SigaCulturalRow;

    await prisma.inscricao.update({
      where: { id: input.id },
      data: rowToPrisma(parsed, {
        contextoId: existing.contextoId ?? undefined,
        nomeContexto: existing.nomeContexto,
      }),
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "inscricao.updated",
      entityType: "Inscricao",
      entityId: input.id,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar";
    return { ok: false, error: message };
  }
}

export async function deleteInscricaoAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission("inscricoes:write");
  try {
    const existing = await prisma.inscricao.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Registro não encontrado." };
    const allowed = await assertDataAccess(
      user.id,
      {
        contextoId: existing.contextoId,
        idProjeto: existing.idProjeto,
        idAcao: existing.idAcao,
      },
      { write: true },
    );
    if (!allowed) return { ok: false, error: "Fora do seu escopo de dados." };
    await prisma.inscricao.delete({ where: { id } });
    await writeAuditLog({
      actorUserId: user.id,
      action: "inscricao.deleted",
      entityType: "Inscricao",
      entityId: id,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir";
    return { ok: false, error: message };
  }
}

export type ListFilters = {
  q?: string;
  idProjeto?: string;
  idAcao?: string;
  proponente?: string;
  pronac?: string;
  nomeProjeto?: string;
  anoProjeto?: string;
  selecionados?: string;
  participantes?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  sortDir?: string;
};

export type ContextFilterOptions = {
  projetos: { idProjeto: string; nomeProjeto: string }[];
  acoes: { idAcao: string; nomeAcao: string }[];
  proponentes: string[];
  pronacs: string[];
  anos: string[];
};

function andWhere(
  a: Prisma.InscricaoWhereInput,
  b: Prisma.InscricaoWhereInput,
): Prisma.InscricaoWhereInput {
  const aEmpty = Object.keys(a).length === 0;
  const bEmpty = Object.keys(b).length === 0;
  if (aEmpty) return b;
  if (bEmpty) return a;
  return { AND: [a, b] };
}

/** Filtros da Base que têm lista de opções (cada um em cascata com os outros). */
type FiltroBase = "idProjeto" | "idAcao" | "proponente" | "pronac" | "anoProjeto";

export async function listInscricoesAction(filters: ListFilters = {}) {
  const user = await requirePermission("inscricoes:read");
  const scope = await resolveDataScope(user.id);
  const scopeWhere = inscricaoWhereFromScope(scope);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 20));
  let fixo: Prisma.InscricaoWhereInput = {};

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const cpfDigits = normalizeCpf(q);
    const or: Prisma.InscricaoWhereInput[] = [
      { nome: { contains: q, mode: "insensitive" } },
      { apelido: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { pronac: { contains: q, mode: "insensitive" } },
      { nomeAcao: { contains: q, mode: "insensitive" } },
    ];
    if (cpfDigits.length >= 3) {
      or.push({ cpf: { contains: cpfDigits } });
    }
    fixo.OR = or;
  }
  if (filters.nomeProjeto?.trim()) {
    fixo.nomeProjeto = filters.nomeProjeto.trim();
  }
  if (filters.selecionados === "1" || filters.selecionados === "0") {
    fixo.selecionados = Number(filters.selecionados);
  }
  if (filters.participantes === "1" || filters.participantes === "0") {
    fixo.participantes = Number(filters.participantes);
  }
  fixo = andWhere(fixo, scopeWhere);

  const ano = filters.anoProjeto?.trim()
    ? extractProjectYear(filters.anoProjeto) || filters.anoProjeto.trim()
    : "";
  const proponente = filters.proponente?.trim() ?? "";
  // Todas as grafias do proponente ("… LTDA", com CNPJ, apelidos) contam como ele.
  const variantes = proponente ? await proponenteVariantes(user.id, proponente) : [];
  const conds: Record<FiltroBase, Prisma.InscricaoWhereInput | null> = {
    idProjeto: filters.idProjeto?.trim() ? { idProjeto: filters.idProjeto.trim() } : null,
    idAcao: filters.idAcao?.trim() ? { idAcao: filters.idAcao.trim() } : null,
    proponente: proponente ? { proponente: { in: variantes } } : null,
    pronac: filters.pronac?.trim() ? { pronac: filters.pronac.trim() } : null,
    anoProjeto: ano
      ? { identificacaoAnoProjeto: { contains: ano, mode: "insensitive" } }
      : null,
  };
  const whereSem = (sem?: FiltroBase): Prisma.InscricaoWhereInput =>
    (Object.keys(conds) as FiltroBase[])
      .filter((k) => k !== sem && conds[k])
      .reduce<Prisma.InscricaoWhereInput>((acc, k) => andWhere(acc, conds[k]!), fixo);
  const where = whereSem();

  const sort = parseInscricaoSort(filters.sort);
  const sortDir = parseSortDir(filters.sortDir);
  const orderBy = inscricaoOrderBy(sort, sortDir);

  const [total, records, filterOptions, cpfsUnicos] = await Promise.all([
    prisma.inscricao.count({ where }),
    prisma.inscricao.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    // Cada filtro mostra só o que combina com os outros já escolhidos (cascata).
    opcoesDaBaseEmCascata(whereSem),
    cpfsUnicosDoFiltro(where),
  ]);

  // O valor escolhido continua na lista, mesmo que a cascata o tenha tirado.
  if (proponente && !filterOptions.proponentes.includes(proponente)) {
    filterOptions.proponentes = [proponente, ...filterOptions.proponentes];
  }
  if (ano && !filterOptions.anos.includes(ano)) filterOptions.anos = [ano, ...filterOptions.anos];
  const pronacSel = filters.pronac?.trim();
  if (pronacSel && !filterOptions.pronacs.includes(pronacSel)) {
    filterOptions.pronacs = [pronacSel, ...filterOptions.pronacs];
  }

  return {
    total,
    cpfsUnicos,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    rows: records.map((r) => ({ id: r.id, ...prismaToRow(r) })),
    acoes: filterOptions.acoes,
    filterOptions,
  };
}

/** Opções de cada filtro da Base considerando os demais filtros ativos. */
async function opcoesDaBaseEmCascata(
  whereSem: (sem: FiltroBase) => Prisma.InscricaoWhereInput,
): Promise<ContextFilterOptions> {
  const [projetos, acoes, proponentes, pronacs, anos] = await Promise.all([
    prisma.inscricao.groupBy({ by: ["idProjeto", "nomeProjeto"], where: whereSem("idProjeto") }),
    prisma.inscricao.groupBy({ by: ["idAcao", "nomeAcao"], where: whereSem("idAcao") }),
    prisma.inscricao.groupBy({
      by: ["proponente"],
      where: whereSem("proponente"),
      _count: { _all: true },
    }),
    prisma.inscricao.groupBy({ by: ["pronac"], where: whereSem("pronac") }),
    prisma.inscricao.groupBy({ by: ["identificacaoAnoProjeto"], where: whereSem("anoProjeto") }),
  ]);
  const unicos = (l: string[]) =>
    [...new Set(l.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { numeric: true }),
    );
  const porId = <T extends { id: string; nome: string }>(l: T[]) =>
    [...new Map(l.filter((x) => x.id.trim()).map((x) => [x.id, x])).values()].sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
  return {
    projetos: porId(projetos.map((g) => ({ id: g.idProjeto, nome: g.nomeProjeto || g.idProjeto }))).map(
      (p) => ({ idProjeto: p.id, nomeProjeto: p.nome }),
    ),
    acoes: porId(acoes.map((g) => ({ id: g.idAcao, nome: g.nomeAcao || g.idAcao }))).map((a) => ({
      idAcao: a.id,
      nomeAcao: a.nome,
    })),
    proponentes: agruparProponentes(
      proponentes.map((g) => ({ nome: g.proponente, n: g._count._all })),
    ).map((o) => o.value),
    pronacs: unicos(pronacs.map((g) => g.pronac)),
    anos: unicos(
      anos.map((g) => extractProjectYear(g.identificacaoAnoProjeto) || g.identificacaoAnoProjeto),
    ),
  };
}

export async function listAllRowsForExport(): Promise<SigaCulturalRow[]> {
  const user = await requirePermission("inscricoes:export");
  const scope = await resolveDataScope(user.id);
  const where = inscricaoWhereFromScope(scope);
  const records = await prisma.inscricao.findMany({
    where,
    orderBy: [{ idProjeto: "asc" }, { idAcao: "asc" }, { nome: "asc" }],
  });
  return records.map(prismaToRow);
}

export type AnaliseFilters = {
  proponente?: string;
  idProjeto?: string;
  idAcao?: string;
  estado?: string;
  cidade?: string;
  territorio?: string;
  socioCohort?: SocioCohort;
};

/** Etapas da inscrição em bits: 1 selecionado, 2 participante, 4 certificado. */
function etapasDaLinha(r: { selecionados: number; participantes: number; certificado: number }): number {
  return (r.selecionados > 0 ? 1 : 0) | (r.participantes > 0 ? 2 : 0) | (r.certificado > 0 ? 4 : 0);
}

/** CPFs únicos por etapa a partir das etapas (bits) de cada pessoa. */
function contarEtapas(bitsPorPessoa: Iterable<number>): CpfsUnicos {
  const c = { inscritos: 0, selecionados: 0, participantes: 0, certificados: 0 };
  for (const b of bitsPorPessoa) {
    c.inscritos++;
    if (b & 1) c.selecionados++;
    if (b & 2) c.participantes++;
    if (b & 4) c.certificados++;
  }
  return c;
}

export type AnaliseRow = {
  id_oficina: string;
  id_projeto: string;
  Nome_oficina: string;
  Nome_projeto: string;
  Estado: string;
  Cidade: string;
  Territorio: string;
  Inscritos: number;
  Selecionados: number;
  Participantes: number;
  Certificado: number;
  /** Pessoas diferentes (CPFs únicos) nesta linha, por etapa. */
  CpfsUnicos: CpfsUnicos;
  /**
   * Um número por pessoa (não é o CPF), para a tela contar pessoas diferentes
   * ao somar várias linhas (busca e página). Cada valor é `id * 8 + etapas`,
   * com as etapas em bits: 1 selecionado, 2 participante, 4 certificado.
   */
  pessoas: number[];
  taxaSelecao: number;
  taxaParticipacao: number;
  taxaCertificado: number;
};

export type AnaliseTopPessoa = {
  posicao: number;
  cpf: string;
  nome: string;
  inscricoes: number;
  selecionados: number;
  participantes: number;
  certificados: number;
};

export type AnaliseResult = {
  rows: AnaliseRow[];
  totais: {
    Inscritos: number;
    Selecionados: number;
    Participantes: number;
    Certificado: number;
    CpfsUnicos: CpfsUnicos;
    acoes: number;
    projetos: number;
  };
  topParticipantes: AnaliseTopPessoa[];
  socio: SocioBreakdown;
  programas: ProgramaListItem[];
  /** Opções de cada filtro, já limitadas pelos outros filtros ativos. */
  filterOptions: Record<FiltroAnalise, OpcaoFiltro[]>;
};

export type FiltroAnalise = "proponente" | "idProjeto" | "idAcao" | "estado" | "cidade" | "territorio";

export type OpcaoFiltro = { value: string; label: string; hint?: string; inscricoes: number };

/** Opções de cada filtro com o nº de inscrições, considerando os demais filtros. */
async function opcoesDosFiltros(
  whereSem: (sem: FiltroAnalise) => Prisma.InscricaoWhereInput,
): Promise<Record<FiltroAnalise, OpcaoFiltro[]>> {
  const contar = { _count: { _all: true } } as const;
  const [proponentes, projetos, acoes, estados, cidades, territorios] = await Promise.all([
    prisma.inscricao.groupBy({ by: ["proponente"], where: whereSem("proponente"), ...contar }),
    prisma.inscricao.groupBy({ by: ["idProjeto", "nomeProjeto"], where: whereSem("idProjeto"), ...contar }),
    prisma.inscricao.groupBy({ by: ["idAcao", "nomeAcao", "nomeProjeto"], where: whereSem("idAcao"), ...contar }),
    prisma.inscricao.groupBy({ by: ["estado"], where: whereSem("estado"), ...contar }),
    prisma.inscricao.groupBy({ by: ["cidade", "estado"], where: whereSem("cidade"), ...contar }),
    prisma.inscricao.groupBy({ by: ["territorio", "cidade"], where: whereSem("territorio"), ...contar }),
  ]);
  // Junta linhas com o mesmo valor (ex.: mesma cidade em grafias de UF diferentes).
  function juntar(lista: Array<{ value: string; label: string; hint?: string; n: number }>): OpcaoFiltro[] {
    const m = new Map<string, OpcaoFiltro & { dicas: Set<string> }>();
    for (const x of lista) {
      const value = x.value.trim();
      if (!value) continue;
      const chave = value.toLocaleLowerCase("pt-BR");
      const cur = m.get(chave) ?? { value, label: x.label.trim() || value, inscricoes: 0, dicas: new Set<string>() };
      cur.inscricoes += x.n;
      if (x.hint?.trim()) cur.dicas.add(x.hint.trim());
      m.set(chave, cur);
    }
    return [...m.values()]
      .map(({ dicas, ...o }) => ({ ...o, hint: dicas.size ? [...dicas].slice(0, 2).join(", ") + (dicas.size > 2 ? "…" : "") : undefined }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
  }
  return {
    proponente: agruparProponentes(
      proponentes.map((g) => ({ nome: g.proponente, n: g._count._all })),
    ).map((o) => ({ value: o.value, label: o.label, inscricoes: o.n })),
    idProjeto: juntar(projetos.map((g) => ({ value: g.idProjeto, label: g.nomeProjeto || g.idProjeto, n: g._count._all }))),
    idAcao: juntar(acoes.map((g) => ({ value: g.idAcao, label: g.nomeAcao || g.idAcao, hint: g.nomeProjeto, n: g._count._all }))),
    estado: juntar(estados.map((g) => ({ value: g.estado, label: g.estado, n: g._count._all }))),
    cidade: juntar(cidades.map((g) => ({ value: g.cidade, label: g.cidade, hint: g.estado, n: g._count._all }))),
    territorio: juntar(territorios.map((g) => ({ value: g.territorio, label: g.territorio, hint: g.cidade, n: g._count._all }))),
  };
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function getAnaliseAction(
  filters: AnaliseFilters = {},
): Promise<AnaliseResult> {
  const user = await requirePermission("analise:read");
  const scope = await resolveDataScope(user.id);
  const scopeWhere = inscricaoWhereFromScope(scope);

  // Uma condição por filtro; as opções de cada filtro respeitam os outros filtros.
  const igual = (v: string) => ({ equals: v, mode: "insensitive" as const });
  const conds: Record<FiltroAnalise, Prisma.InscricaoWhereInput | null> = {
    proponente: filters.proponente?.trim()
      ? { proponente: { in: await proponenteVariantes(user.id, filters.proponente.trim()) } }
      : null,
    idProjeto: filters.idProjeto?.trim() ? { idProjeto: filters.idProjeto.trim() } : null,
    idAcao: filters.idAcao?.trim() ? { idAcao: filters.idAcao.trim() } : null,
    estado: filters.estado?.trim() ? { estado: igual(filters.estado.trim()) } : null,
    cidade: filters.cidade?.trim() ? { cidade: igual(filters.cidade.trim()) } : null,
    territorio: filters.territorio?.trim() ? { territorio: igual(filters.territorio.trim()) } : null,
  };
  const whereSem = (sem?: FiltroAnalise): Prisma.InscricaoWhereInput => {
    const partes = (Object.keys(conds) as FiltroAnalise[])
      .filter((k) => k !== sem && conds[k])
      .map((k) => conds[k]!);
    return partes.reduce<Prisma.InscricaoWhereInput>((acc, c) => andWhere(acc, c), scopeWhere);
  };
  const where = whereSem();

  const [grouped, filterOptions, byCpf, cpfsDasLinhas] = await Promise.all([
    prisma.inscricao.groupBy({
      by: [
        "idAcao",
        "idProjeto",
        "nomeAcao",
        "nomeProjeto",
        "estado",
        "cidade",
        "territorio",
      ],
      where,
      _sum: {
        inscritos: true,
        selecionados: true,
        participantes: true,
        certificado: true,
      },
      orderBy: [{ idProjeto: "asc" }, { idAcao: "asc" }],
    }),
    opcoesDosFiltros(whereSem),
    prisma.inscricao.groupBy({
      by: ["cpf"],
      where: {
        ...where,
        cpf: { not: "" },
      },
      _sum: {
        inscritos: true,
        selecionados: true,
        participantes: true,
        certificado: true,
      },
      _count: { _all: true },
    }),
    // CPFs de cada linha da tabela (mesmo agrupamento), para contar pessoas.
    prisma.inscricao.findMany({
      where: { AND: [where, { cpf: { not: "" } }] },
      select: {
        cpf: true,
        idAcao: true,
        idProjeto: true,
        nomeAcao: true,
        nomeProjeto: true,
        estado: true,
        cidade: true,
        territorio: true,
        selecionados: true,
        participantes: true,
        certificado: true,
      },
      distinct: [
        "idAcao",
        "idProjeto",
        "nomeAcao",
        "nomeProjeto",
        "estado",
        "cidade",
        "territorio",
        "cpf",
        "selecionados",
        "participantes",
        "certificado",
      ],
    }),
  ]);

  const chaveLinha = (g: {
    idAcao: string;
    idProjeto: string;
    nomeAcao: string;
    nomeProjeto: string;
    estado: string;
    cidade: string;
    territorio: string;
  }) => [g.idAcao, g.idProjeto, g.nomeAcao, g.nomeProjeto, g.estado, g.cidade, g.territorio].join("\u0001");
  const numeroDaPessoa = new Map<string, number>();
  /** Por linha: pessoa → etapas (bits) que ela alcançou naquela linha. */
  const pessoasPorLinha = new Map<string, Map<number, number>>();
  /** No total: pessoa → etapas alcançadas em qualquer linha. */
  const etapasNoTotal = new Map<number, number>();
  for (const r of cpfsDasLinhas) {
    const k = chaveCpf(r.cpf);
    if (!k) continue;
    let n = numeroDaPessoa.get(k);
    if (n === undefined) numeroDaPessoa.set(k, (n = numeroDaPessoa.size));
    const bits = etapasDaLinha(r);
    const linha = chaveLinha(r);
    let m = pessoasPorLinha.get(linha);
    if (!m) pessoasPorLinha.set(linha, (m = new Map()));
    m.set(n, (m.get(n) ?? 0) | bits);
    etapasNoTotal.set(n, (etapasNoTotal.get(n) ?? 0) | bits);
  }

  const rows: AnaliseRow[] = grouped.map((g) => {
    const Inscritos = g._sum.inscritos ?? 0;
    const Selecionados = g._sum.selecionados ?? 0;
    const Participantes = g._sum.participantes ?? 0;
    const Certificado = g._sum.certificado ?? 0;
    const daLinha = pessoasPorLinha.get(chaveLinha(g)) ?? new Map<number, number>();
    const pessoas = [...daLinha].map(([id, bits]) => id * 8 + bits);
    return {
      id_oficina: g.idAcao,
      id_projeto: g.idProjeto,
      Nome_oficina: g.nomeAcao || g.idAcao,
      Nome_projeto: g.nomeProjeto || g.idProjeto,
      Estado: g.estado || "—",
      Cidade: g.cidade || "—",
      Territorio: g.territorio || "—",
      Inscritos,
      Selecionados,
      Participantes,
      Certificado,
      CpfsUnicos: contarEtapas(daLinha.values()),
      pessoas,
      taxaSelecao: pct(Selecionados, Inscritos),
      taxaParticipacao: pct(Participantes, Selecionados || Inscritos),
      taxaCertificado: pct(
        Certificado,
        Participantes || Selecionados || Inscritos,
      ),
    };
  });

  const totais = rows.reduce(
    (acc, r) => {
      acc.Inscritos += r.Inscritos;
      acc.Selecionados += r.Selecionados;
      acc.Participantes += r.Participantes;
      acc.Certificado += r.Certificado;
      return acc;
    },
    {
      Inscritos: 0,
      Selecionados: 0,
      Participantes: 0,
      Certificado: 0,
      CpfsUnicos: contarEtapas(etapasNoTotal.values()),
      acoes: 0,
      projetos: 0,
    },
  );
  totais.acoes = new Set(rows.map((r) => r.id_oficina)).size;
  totais.projetos = new Set(rows.map((r) => r.id_projeto)).size;

  const mergedByCpf = new Map<
    string,
    {
      cpf: string;
      inscricoes: number;
      selecionados: number;
      participantes: number;
      certificados: number;
    }
  >();
  for (const g of byCpf) {
    const cpf = g.cpf.replace(/\D/g, "");
    if (cpf.length !== 11) continue;
    const cur = mergedByCpf.get(cpf) ?? {
      cpf,
      inscricoes: 0,
      selecionados: 0,
      participantes: 0,
      certificados: 0,
    };
    cur.inscricoes += g._count._all;
    cur.selecionados += g._sum.selecionados ?? 0;
    cur.participantes += g._sum.participantes ?? 0;
    cur.certificados += g._sum.certificado ?? 0;
    mergedByCpf.set(cpf, cur);
  }

  const ranked = [...mergedByCpf.values()]
    .sort(
      (a, b) =>
        b.participantes - a.participantes ||
        b.selecionados - a.selecionados ||
        b.inscricoes - a.inscricoes,
    )
    .slice(0, 10);

  const topCpfs = ranked.map((r) => r.cpf);
  const nomeRows =
    topCpfs.length === 0
      ? []
      : await prisma.inscricao.findMany({
          where: { cpf: { in: topCpfs } },
          select: { cpf: true, nome: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
  const nomeByCpf = new Map<string, string>();
  for (const row of nomeRows) {
    const key = row.cpf.replace(/\D/g, "");
    if (!nomeByCpf.has(key) && row.nome.trim()) {
      nomeByCpf.set(key, row.nome.trim());
    }
  }

  const topParticipantes: AnaliseTopPessoa[] = ranked.map((r, i) => ({
    posicao: i + 1,
    cpf: r.cpf,
    nome: nomeByCpf.get(r.cpf) || "Sem nome",
    inscricoes: r.inscricoes,
    selecionados: r.selecionados,
    participantes: r.participantes,
    certificados: r.certificados,
  }));

  const [socio, programas] = await Promise.all([
    aggregateSocio(andSocioCohort(where, filters.socioCohort ?? "inscritos")),
    listContextosPanoramaAction(),
  ]);

  return {
    rows,
    totais,
    topParticipantes,
    socio,
    programas: programas.filter((p) => p.edicoes >= 2).slice(0, 20),
    filterOptions,
  };
}

export async function createInscricaoPublicAction(
  input: Partial<SigaCulturalRow> & {
    id_oficina: string;
    turnstileToken?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const clientIp = await clientIpFromHeaders();
    const rateLimitKey = `${clientIp}:${input.id_oficina}`;

    if (inscricaoRateLimitRequired()) {
      const limited = await checkInscricaoRateLimit(rateLimitKey);
      if (!limited.allowed) {
        return {
          ok: false,
          error: `Muitas tentativas. Aguarde ${limited.retryAfterSec}s e tente novamente.`,
        };
      }
    }

    if (turnstileRequired()) {
      const valid = await verifyTurnstileToken(input.turnstileToken, clientIp);
      if (!valid) {
        return {
          ok: false,
          error: "Verificação de segurança inválida. Recarregue a página e tente novamente.",
        };
      }
    }

    const existing = await prisma.inscricao.findFirst({
      where: { idAcao: input.id_oficina },
      select: {
        contextoId: true,
        nomeContexto: true,
        idProjeto: true,
        idAcao: true,
        proponente: true,
        pronac: true,
        nomeProjeto: true,
        identificacaoAnoProjeto: true,
        nomeAcao: true,
      },
    });

    const acao = await prisma.acao.findUnique({
      where: { id: input.id_oficina },
      include: { projeto: { include: { contexto: true } } },
    });

    const context: BatchContext = {
      contextoId:
        acao?.projeto.contextoId || existing?.contextoId || undefined,
      Nome_contexto:
        acao?.projeto.contexto.nome || existing?.nomeContexto || "",
      id_projeto:
        input.id_projeto ||
        acao?.projetoId ||
        existing?.idProjeto ||
        input.id_oficina,
      id_oficina: input.id_oficina,
      PROPONENTE:
        input.PROPONENTE ||
        acao?.projeto.proponente ||
        existing?.proponente ||
        "",
      PRONAC: input.PRONAC || acao?.projeto.pronac || existing?.pronac || "",
      Nome_projeto:
        input.Nome_projeto ||
        acao?.projeto.nome ||
        existing?.nomeProjeto ||
        "",
      Identificacao_ano_projeto:
        input.Identificacao_ano_projeto ||
        acao?.projeto.ano ||
        existing?.identificacaoAnoProjeto ||
        String(new Date().getFullYear()),
      Nome_oficina:
        input.Nome_oficina ||
        acao?.nome ||
        existing?.nomeAcao ||
        input.id_oficina,
    };

    const row = normalizeRow(
      {
        ...input,
        CPF: normalizeCpf(input.CPF),
        CEP: normalizeCep(input.CEP),
        Telefone: normalizePhone(input.Telefone),
        Data_inscricao: input.Data_inscricao || new Date().toLocaleDateString("pt-BR"),
        Inscritos: 1,
        Selecionados: 0,
        Participantes: 0,
        Certificado: 0,
      },
      context,
    );

    if (!row.Nome.trim()) {
      return { ok: false, error: "Nome é obrigatório." };
    }
    if (row.CPF.length !== 11) {
      return { ok: false, error: "CPF deve ter 11 dígitos." };
    }

    await prisma.inscricao.create({
      data: rowToPrisma(row, {
        contextoId: context.contextoId,
        nomeContexto: context.Nome_contexto,
      }),
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar inscrição";
    return { ok: false, error: message };
  }
}

export async function getAcaoContext(acaoId: string) {
  const acao = await prisma.acao.findUnique({
    where: { id: acaoId },
    include: {
      projeto: {
        include: { contexto: true },
      },
    },
  });

  if (acao) {
    return {
      contextoId: acao.projeto.contextoId,
      Nome_contexto: acao.projeto.contexto.nome,
      id_projeto: acao.projetoId,
      id_oficina: acao.id,
      PROPONENTE: acao.projeto.proponente,
      PRONAC: acao.projeto.pronac,
      Nome_projeto: acao.projeto.nome,
      Identificacao_ano_projeto: acao.projeto.ano,
      Nome_oficina: acao.nome,
    } satisfies BatchContext;
  }

  const existing = await prisma.inscricao.findFirst({
    where: { idAcao: acaoId },
    select: {
      contextoId: true,
      nomeContexto: true,
      idProjeto: true,
      idAcao: true,
      proponente: true,
      pronac: true,
      nomeProjeto: true,
      identificacaoAnoProjeto: true,
      nomeAcao: true,
    },
  });

  if (existing) {
    return {
      contextoId: existing.contextoId ?? undefined,
      Nome_contexto: existing.nomeContexto,
      id_projeto: existing.idProjeto,
      id_oficina: existing.idAcao,
      PROPONENTE: existing.proponente,
      PRONAC: existing.pronac,
      Nome_projeto: existing.nomeProjeto,
      Identificacao_ano_projeto: existing.identificacaoAnoProjeto,
      Nome_oficina: existing.nomeAcao,
    } satisfies BatchContext;
  }

  return {
    id_projeto: acaoId,
    id_oficina: acaoId,
    PROPONENTE: "",
    PRONAC: "",
    Nome_projeto: "",
    Identificacao_ano_projeto: String(new Date().getFullYear()),
    Nome_oficina: acaoId,
  } satisfies BatchContext;
}
