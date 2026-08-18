"use server";

import { requirePermission } from "@/lib/auth";
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
} from "@/lib/normalize";
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
import * as XLSX from "xlsx";
import { aggregateSocio, type SocioBreakdown } from "@/lib/socio";
import {
  getAnaliseFilterOptions,
  getInscricaoFilterOptions,
} from "@/lib/inscricao-filters";
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
        idOficina: sample.id_oficina,
      },
      { write: true },
    );
    if (!ok) throw new Error("Oficina fora do seu escopo de dados.");
  }
  const normalized = rows.map((row) =>
    SigaCulturalRowSchema.parse(normalizeRow(row)) as SigaCulturalRow,
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
    meta: { inserted: result.count, oficina: sample?.id_oficina },
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
        idOficina: existing.idOficina,
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
        idOficina: existing.idOficina,
      },
      { write: true },
    );
    if (!allowed) return { ok: false, error: "Fora do seu escopo de dados." };
    await prisma.inscricao.delete({ where: { id } });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir";
    return { ok: false, error: message };
  }
}

export type ListFilters = {
  q?: string;
  idProjeto?: string;
  idOficina?: string;
  proponente?: string;
  pronac?: string;
  nomeProjeto?: string;
  anoProjeto?: string;
  selecionados?: string;
  participantes?: string;
  page?: number;
  pageSize?: number;
};

export type ContextFilterOptions = {
  projetos: { idProjeto: string; nomeProjeto: string }[];
  oficinas: { idOficina: string; nomeOficina: string }[];
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

export async function listInscricoesAction(filters: ListFilters = {}) {
  const user = await requirePermission("inscricoes:read");
  const scope = await resolveDataScope(user.id);
  const scopeWhere = inscricaoWhereFromScope(scope);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 20));
  let where: Prisma.InscricaoWhereInput = {};

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const cpfDigits = normalizeCpf(q);
    const or: Prisma.InscricaoWhereInput[] = [
      { nome: { contains: q, mode: "insensitive" } },
      { apelido: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { pronac: { contains: q, mode: "insensitive" } },
      { nomeOficina: { contains: q, mode: "insensitive" } },
    ];
    if (cpfDigits.length >= 3) {
      or.push({ cpf: { contains: cpfDigits } });
    }
    where.OR = or;
  }
  if (filters.idProjeto?.trim()) {
    where.idProjeto = filters.idProjeto.trim();
  }
  if (filters.idOficina?.trim()) {
    where.idOficina = filters.idOficina.trim();
  }
  if (filters.proponente?.trim()) {
    where.proponente = filters.proponente.trim();
  }
  if (filters.pronac?.trim()) {
    where.pronac = filters.pronac.trim();
  }
  if (filters.nomeProjeto?.trim()) {
    where.nomeProjeto = filters.nomeProjeto.trim();
  }
  if (filters.anoProjeto?.trim()) {
    const ano =
      extractProjectYear(filters.anoProjeto) || filters.anoProjeto.trim();
    where.identificacaoAnoProjeto = {
      contains: ano,
      mode: "insensitive",
    };
  }
  if (filters.selecionados === "1" || filters.selecionados === "0") {
    where.selecionados = Number(filters.selecionados);
  }
  if (filters.participantes === "1" || filters.participantes === "0") {
    where.participantes = Number(filters.participantes);
  }

  where = andWhere(where, scopeWhere);

  const [total, records, filterOptions] = await Promise.all([
    prisma.inscricao.count({ where }),
    prisma.inscricao.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    getInscricaoFilterOptions(user.id),
  ]);

  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    rows: records.map((r) => ({ id: r.id, ...prismaToRow(r) })),
    oficinas: filterOptions.oficinas,
    filterOptions,
  };
}

export async function listAllRowsForExport(): Promise<SigaCulturalRow[]> {
  const user = await requirePermission("inscricoes:export");
  const scope = await resolveDataScope(user.id);
  const where = inscricaoWhereFromScope(scope);
  const records = await prisma.inscricao.findMany({
    where,
    orderBy: [{ idProjeto: "asc" }, { idOficina: "asc" }, { nome: "asc" }],
  });
  return records.map(prismaToRow);
}

export type AnaliseFilters = {
  idProjeto?: string;
  idOficina?: string;
  estado?: string;
  cidade?: string;
  territorio?: string;
};

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
    oficinas: number;
    projetos: number;
  };
  topParticipantes: AnaliseTopPessoa[];
  socio: SocioBreakdown;
  programas: ProgramaListItem[];
  filterOptions: {
    projetos: { idProjeto: string; nomeProjeto: string }[];
    oficinas: { idOficina: string; nomeOficina: string }[];
    estados: string[];
    cidades: string[];
    territorios: string[];
  };
};

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

  let where: Prisma.InscricaoWhereInput = {};
  if (filters.idProjeto?.trim()) where.idProjeto = filters.idProjeto.trim();
  if (filters.idOficina?.trim()) where.idOficina = filters.idOficina.trim();
  if (filters.estado?.trim()) {
    where.estado = {
      equals: filters.estado.trim(),
      mode: "insensitive",
    };
  }
  if (filters.cidade?.trim()) {
    where.cidade = {
      equals: filters.cidade.trim(),
      mode: "insensitive",
    };
  }
  if (filters.territorio?.trim()) {
    where.territorio = {
      equals: filters.territorio.trim(),
      mode: "insensitive",
    };
  }
  where = andWhere(where, scopeWhere);

  const [grouped, filterOptions, byCpf] = await Promise.all([
    prisma.inscricao.groupBy({
      by: [
        "idOficina",
        "idProjeto",
        "nomeOficina",
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
      orderBy: [{ idProjeto: "asc" }, { idOficina: "asc" }],
    }),
    getAnaliseFilterOptions(user.id),
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
  ]);

  const rows: AnaliseRow[] = grouped.map((g) => {
    const Inscritos = g._sum.inscritos ?? 0;
    const Selecionados = g._sum.selecionados ?? 0;
    const Participantes = g._sum.participantes ?? 0;
    const Certificado = g._sum.certificado ?? 0;
    return {
      id_oficina: g.idOficina,
      id_projeto: g.idProjeto,
      Nome_oficina: g.nomeOficina || g.idOficina,
      Nome_projeto: g.nomeProjeto || g.idProjeto,
      Estado: g.estado || "—",
      Cidade: g.cidade || "—",
      Territorio: g.territorio || "—",
      Inscritos,
      Selecionados,
      Participantes,
      Certificado,
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
    { Inscritos: 0, Selecionados: 0, Participantes: 0, Certificado: 0, oficinas: 0, projetos: 0 },
  );
  totais.oficinas = new Set(rows.map((r) => r.id_oficina)).size;
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
    aggregateSocio(where),
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
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const existing = await prisma.inscricao.findFirst({
      where: { idOficina: input.id_oficina },
      select: {
        contextoId: true,
        nomeContexto: true,
        idProjeto: true,
        idOficina: true,
        proponente: true,
        pronac: true,
        nomeProjeto: true,
        identificacaoAnoProjeto: true,
        nomeOficina: true,
      },
    });

    const oficina = await prisma.oficina.findUnique({
      where: { id: input.id_oficina },
      include: { projeto: { include: { contexto: true } } },
    });

    const context: BatchContext = {
      contextoId:
        oficina?.projeto.contextoId || existing?.contextoId || undefined,
      Nome_contexto:
        oficina?.projeto.contexto.nome || existing?.nomeContexto || "",
      id_projeto:
        input.id_projeto ||
        oficina?.projetoId ||
        existing?.idProjeto ||
        input.id_oficina,
      id_oficina: input.id_oficina,
      PROPONENTE:
        input.PROPONENTE ||
        oficina?.projeto.proponente ||
        existing?.proponente ||
        "",
      PRONAC: input.PRONAC || oficina?.projeto.pronac || existing?.pronac || "",
      Nome_projeto:
        input.Nome_projeto ||
        oficina?.projeto.nome ||
        existing?.nomeProjeto ||
        "",
      Identificacao_ano_projeto:
        input.Identificacao_ano_projeto ||
        oficina?.projeto.ano ||
        existing?.identificacaoAnoProjeto ||
        String(new Date().getFullYear()),
      Nome_oficina:
        input.Nome_oficina ||
        oficina?.nome ||
        existing?.nomeOficina ||
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

export async function getOficinaContext(oficinaId: string) {
  const oficina = await prisma.oficina.findUnique({
    where: { id: oficinaId },
    include: {
      projeto: {
        include: { contexto: true },
      },
    },
  });

  if (oficina) {
    return {
      contextoId: oficina.projeto.contextoId,
      Nome_contexto: oficina.projeto.contexto.nome,
      id_projeto: oficina.projetoId,
      id_oficina: oficina.id,
      PROPONENTE: oficina.projeto.proponente,
      PRONAC: oficina.projeto.pronac,
      Nome_projeto: oficina.projeto.nome,
      Identificacao_ano_projeto: oficina.projeto.ano,
      Nome_oficina: oficina.nome,
    } satisfies BatchContext;
  }

  const existing = await prisma.inscricao.findFirst({
    where: { idOficina: oficinaId },
    select: {
      contextoId: true,
      nomeContexto: true,
      idProjeto: true,
      idOficina: true,
      proponente: true,
      pronac: true,
      nomeProjeto: true,
      identificacaoAnoProjeto: true,
      nomeOficina: true,
    },
  });

  if (existing) {
    return {
      contextoId: existing.contextoId ?? undefined,
      Nome_contexto: existing.nomeContexto,
      id_projeto: existing.idProjeto,
      id_oficina: existing.idOficina,
      PROPONENTE: existing.proponente,
      PRONAC: existing.pronac,
      Nome_projeto: existing.nomeProjeto,
      Identificacao_ano_projeto: existing.identificacaoAnoProjeto,
      Nome_oficina: existing.nomeOficina,
    } satisfies BatchContext;
  }

  return {
    id_projeto: oficinaId,
    id_oficina: oficinaId,
    PROPONENTE: "",
    PRONAC: "",
    Nome_projeto: "",
    Identificacao_ano_projeto: String(new Date().getFullYear()),
    Nome_oficina: oficinaId,
  } satisfies BatchContext;
}
