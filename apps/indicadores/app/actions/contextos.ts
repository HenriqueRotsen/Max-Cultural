"use server";

import { proponenteParaGravar } from "@/lib/inscricao-filters";
import { requireAuth, requirePermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import type {
  ContextoDTO,
  ContextoInput,
  AcaoDTO,
  AcaoInput,
  AcaoTipoDTO,
  AcaoTerritorioDTO,
  ProjetoDTO,
  ProjetoInput,
} from "@/lib/contexto";
import { nextIdAcao, nextIdProjeto } from "@/lib/ids";
import { normalizeAnoProjeto, normalizeUf } from "@/lib/normalize";
import { normalizeTerritorioRawKey } from "@/lib/acao-territorio";
import { prisma } from "@/lib/prisma";
import { assertDataAccess, hasScopeAccess, resolveDataScope, contextoWhereFromScope, projetoWhereFromScope, acaoWhereFromScope } from "@/lib/data-scope";
import type { Prisma } from "@prisma/client";
import {
  HIERARQUIA_PAGE_SIZE,
  HIERARQUIA_SELECT_LIMIT,
  type ContextoSelectOption,
  type AcaoSelectOption,
  type ProjetoSelectOption,
} from "@/lib/hierarchy-list";
import {
  contextoOrderBy,
  acaoOrderBy,
  parseSortDir,
  projetoOrderBy,
} from "@/lib/table-sort";
import { getEffectivePermissions } from "@/lib/permissions";
import type { PermissionCode } from "@/lib/permission-catalog";

async function requireAnyPermission(
  codes: PermissionCode[],
): Promise<Awaited<ReturnType<typeof requireAuth>>> {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (!codes.some((c) => perms.has(c))) {
    throw new Error("Sem permissão");
  }
  return user;
}

function toContextoDto(
  c: {
    id: string;
    nome: string;
    createdAt: Date;
    updatedAt: Date;
    _count?: { projetos: number };
  },
  inscricoesCount: number,
  flags: { hasEditorAccess: boolean; canEdit: boolean; canDelete: boolean },
): ContextoDTO {
  const projetosCount = c._count?.projetos ?? 0;
  return {
    id: c.id,
    nome: c.nome,
    projetosCount,
    inscricoesCount,
    hasEditorAccess: flags.hasEditorAccess,
    canEdit: flags.canEdit,
    canDelete:
      flags.canDelete && projetosCount === 0 && inscricoesCount === 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toProjetoDto(
  p: {
    id: string;
    nome: string;
    pronac: string;
    proponente: string;
    ano: string;
    contextoId: string;
    createdAt: Date;
    updatedAt: Date;
    contexto?: { nome: string };
    _count?: { acoes: number };
  },
  inscricoesCount: number,
  flags: { hasEditorAccess: boolean; canEdit: boolean; canDelete: boolean },
): ProjetoDTO {
  const acoesCount = p._count?.acoes ?? 0;
  return {
    id: p.id,
    nome: p.nome,
    pronac: p.pronac,
    proponente: p.proponente,
    ano: p.ano,
    contextoId: p.contextoId,
    contextoNome: p.contexto?.nome ?? "",
    acoesCount,
    inscricoesCount,
    hasEditorAccess: flags.hasEditorAccess,
    canEdit: flags.canEdit,
    canDelete:
      flags.canDelete && acoesCount === 0 && inscricoesCount === 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function toTerritorioDto(t: {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
  ordem: number;
}): AcaoTerritorioDTO {
  return {
    id: t.id,
    nome: t.nome,
    cidade: t.cidade,
    estado: t.estado,
    ordem: t.ordem,
  };
}

function toAcaoDto(
  o: {
    id: string;
    nome: string;
    projetoId: string;
    tipoId?: string;
    tipo?: { nome: string } | null;
    ofereceOnline?: boolean;
    oferecePresencial?: boolean;
    createdAt: Date;
    updatedAt: Date;
    projeto?: {
      nome: string;
      pronac: string;
      proponente: string;
      ano: string;
      contextoId: string;
      contexto?: { nome: string };
    };
    territorios?: Array<{
      id: string;
      nome: string;
      cidade: string;
      estado: string;
      ordem: number;
    }>;
  },
  inscricoesCount: number,
  flags: { hasEditorAccess: boolean; canEdit: boolean; canDelete: boolean },
): AcaoDTO {
  const territorios = [...(o.territorios ?? [])]
    .sort((a, b) => a.ordem - b.ordem)
    .map(toTerritorioDto);
  return {
    id: o.id,
    nome: o.nome,
    projetoId: o.projetoId,
    projetoNome: o.projeto?.nome ?? "",
    contextoId: o.projeto?.contextoId ?? "",
    contextoNome: o.projeto?.contexto?.nome ?? "",
    pronac: o.projeto?.pronac ?? "",
    proponente: o.projeto?.proponente ?? "",
    ano: o.projeto?.ano ?? "",
    tipoId: o.tipoId ?? "oficina",
    tipoNome: o.tipo?.nome ?? "Oficina",
    ofereceOnline: Boolean(o.ofereceOnline),
    oferecePresencial: o.oferecePresencial !== false,
    territorios,
    inscricoesCount,
    hasEditorAccess: flags.hasEditorAccess,
    canEdit: flags.canEdit,
    canDelete: flags.canDelete && inscricoesCount === 0,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

function validateAcaoModalidade(input: AcaoInput): string | null {
  const ofereceOnline = Boolean(input.ofereceOnline);
  const oferecePresencial =
    input.oferecePresencial === undefined
      ? true
      : Boolean(input.oferecePresencial);
  if (!ofereceOnline && !oferecePresencial) {
    return "Marque ao menos Online ou Presencial.";
  }
  if (oferecePresencial) {
    const terrs = input.territorios ?? [];
    if (terrs.length === 0) {
      return "Ação presencial precisa de ao menos um território (cidade/UF).";
    }
    for (const t of terrs) {
      if (!String(t.cidade ?? "").trim()) {
        return "Informe a cidade de cada território presencial.";
      }
      const uf = normalizeUf(t.estado);
      if (!uf || uf.length !== 2) {
        return "Informe a UF (2 letras) de cada território presencial.";
      }
    }
  }
  return null;
}

async function replaceAcaoTerritorios(
  acaoId: string,
  input: AcaoInput,
) {
  const oferecePresencial =
    input.oferecePresencial === undefined
      ? true
      : Boolean(input.oferecePresencial);
  await prisma.acaoTerritorio.deleteMany({ where: { acaoId } });
  if (!oferecePresencial) return;
  const terrs = input.territorios ?? [];
  if (!terrs.length) return;
  await prisma.acaoTerritorio.createMany({
    data: terrs.map((t, i) => ({
      acaoId,
      nome: String(t.nome ?? "").trim(),
      cidade: String(t.cidade ?? "").trim(),
      estado: normalizeUf(t.estado),
      ordem: t.ordem ?? i,
    })),
  });
}

const ACAO_INCLUDE = {
  projeto: {
    select: {
      nome: true,
      pronac: true,
      proponente: true,
      ano: true,
      contextoId: true,
      contexto: { select: { nome: true } },
    },
  },
  territorios: { orderBy: { ordem: "asc" as const } },
  tipo: { select: { nome: true } },
} as const;

/** Tipo informado na ação: precisa existir e estar ativo (padrão: oficina). */
async function resolveAcaoTipoId(tipoId: string | undefined): Promise<string | null> {
  const id = (tipoId || "oficina").trim();
  const tipo = await prisma.acaoTipo.findUnique({ where: { id }, select: { id: true, ativo: true } });
  return tipo?.ativo ? tipo.id : null;
}

/** Tipos de ação ativos, para escolher no cadastro. */
export async function listAcaoTiposAction(): Promise<AcaoTipoDTO[]> {
  await requireAnyPermission(["contextos:read", "contextos:create", "import:write"]);
  return prisma.acaoTipo.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true },
  });
}

async function countInscricoesByContexto(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await prisma.inscricao.groupBy({
    by: ["contextoId"],
    where: { contextoId: { in: ids } },
    _count: { _all: true },
  });
  return new Map(
    rows
      .filter((r) => r.contextoId)
      .map((r) => [r.contextoId!, r._count._all]),
  );
}

async function countInscricoesByProjeto(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await prisma.inscricao.groupBy({
    by: ["idProjeto"],
    where: { idProjeto: { in: ids } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.idProjeto, r._count._all]));
}

async function countInscricoesByAcao(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await prisma.inscricao.groupBy({
    by: ["idAcao"],
    where: { idAcao: { in: ids } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.idAcao, r._count._all]));
}

type HierarchyAccess = {
  scope: Awaited<ReturnType<typeof resolveDataScope>>;
  canCreate: boolean;
  canWrite: boolean;
};

type ListPageMeta = {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

async function requireHierarchyRead(): Promise<HierarchyAccess> {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("contextos:read") && !perms.has("import:write")) {
    throw new Error("Sem permissão");
  }
  const scope = await resolveDataScope(user.id);
  return {
    scope,
    canCreate: perms.has("contextos:create") || perms.has("import:write"),
    canWrite: perms.has("contextos:write"),
  };
}

function parsePageInput(page?: number, pageSize = HIERARQUIA_PAGE_SIZE) {
  const safePage =
    Number.isFinite(page) && (page ?? 0) >= 1 ? Math.floor(page!) : 1;
  return {
    page: safePage,
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    pageSize,
  };
}

function pageMeta(total: number, page: number, pageSize: number): ListPageMeta {
  return {
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize) || 1),
  };
}

function mergeWhere<T>(...parts: (T | undefined)[]): T {
  const filters = parts.filter(
    (p) => p && Object.keys(p as object).length > 0,
  ) as T[];
  if (filters.length === 0) return {} as T;
  if (filters.length === 1) return filters[0];
  return { AND: filters } as unknown as T;
}

function searchContextoWhere(q?: string): Prisma.ContextoWhereInput {
  const term = q?.trim();
  if (!term) return {};
  return { nome: { contains: term, mode: "insensitive" } };
}

function searchProjetoWhere(q?: string): Prisma.ProjetoWhereInput {
  const term = q?.trim();
  if (!term) return {};
  return {
    OR: [
      { nome: { contains: term, mode: "insensitive" } },
      { pronac: { contains: term, mode: "insensitive" } },
      { proponente: { contains: term, mode: "insensitive" } },
    ],
  };
}

function searchAcaoWhere(q?: string): Prisma.AcaoWhereInput {
  const term = q?.trim();
  if (!term) return {};
  return {
    OR: [
      { nome: { contains: term, mode: "insensitive" } },
      { projeto: { nome: { contains: term, mode: "insensitive" } } },
      { projeto: { pronac: { contains: term, mode: "insensitive" } } },
    ],
  };
}

function isEmptyScoped(scope: HierarchyAccess["scope"]) {
  return (
    scope.mode !== "ALL" &&
    !(
      (scope.contextoIds?.length ?? 0) ||
      (scope.projetoIds?.length ?? 0) ||
      (scope.acaoIds?.length ?? 0)
    )
  );
}

export async function listContextosPageAction(params?: {
  page?: number;
  q?: string;
  pageSize?: number;
  sort?: string;
  sortDir?: string;
}): Promise<
  ListPageMeta & {
    items: ContextoDTO[];
    canCreate: boolean;
    canWrite: boolean;
  }
> {
  const { scope, canCreate, canWrite } = await requireHierarchyRead();
  const pageSize = params?.pageSize ?? HIERARQUIA_PAGE_SIZE;
  const { page, skip, take } = parsePageInput(params?.page, pageSize);

  if (isEmptyScoped(scope)) {
    return { items: [], canCreate, canWrite, ...pageMeta(0, page, pageSize) };
  }

  const where = mergeWhere<Prisma.ContextoWhereInput>(
    contextoWhereFromScope(scope),
    searchContextoWhere(params?.q),
  );

  const total = await prisma.contexto.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const rows = await prisma.contexto.findMany({
    where,
    include: { _count: { select: { projetos: true } } },
    orderBy: contextoOrderBy(params?.sort, parseSortDir(params?.sortDir)),
    skip: (safePage - 1) * pageSize,
    take,
  });

  const counts = await countInscricoesByContexto(rows.map((c) => c.id));

  return {
    ...pageMeta(total, safePage, pageSize),
    canCreate,
    canWrite,
    items: rows.map((c) => {
      const writeAccess = hasScopeAccess(
        scope,
        { contextoId: c.id },
        { write: true },
      );
      return toContextoDto(c, counts.get(c.id) ?? 0, {
        hasEditorAccess: writeAccess,
        canEdit: (canWrite || canCreate) && writeAccess,
        canDelete: (canWrite || canCreate) && writeAccess,
      });
    }),
  };
}

export async function listProjetosPageAction(params?: {
  page?: number;
  q?: string;
  contextoId?: string;
  pageSize?: number;
  sort?: string;
  sortDir?: string;
}): Promise<
  ListPageMeta & {
    items: ProjetoDTO[];
    canCreate: boolean;
    canWrite: boolean;
  }
> {
  const { scope, canCreate, canWrite } = await requireHierarchyRead();
  const pageSize = params?.pageSize ?? HIERARQUIA_PAGE_SIZE;
  const { page, skip, take } = parsePageInput(params?.page, pageSize);

  if (isEmptyScoped(scope)) {
    return { items: [], canCreate, canWrite, ...pageMeta(0, page, pageSize) };
  }

  const where = mergeWhere<Prisma.ProjetoWhereInput>(
    projetoWhereFromScope(scope),
    searchProjetoWhere(params?.q),
    params?.contextoId ? { contextoId: params.contextoId } : undefined,
  );

  const total = await prisma.projeto.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const rows = await prisma.projeto.findMany({
    where,
    include: {
      contexto: { select: { nome: true } },
      _count: { select: { acoes: true } },
    },
    orderBy: [projetoOrderBy(params?.sort, parseSortDir(params?.sortDir))],
    skip: (safePage - 1) * pageSize,
    take,
  });

  const counts = await countInscricoesByProjeto(rows.map((p) => p.id));

  return {
    ...pageMeta(total, safePage, pageSize),
    canCreate,
    canWrite,
    items: rows.map((p) => {
      const writeAccess = hasScopeAccess(
        scope,
        { contextoId: p.contextoId, idProjeto: p.id },
        { write: true },
      );
      return toProjetoDto(p, counts.get(p.id) ?? 0, {
        hasEditorAccess: writeAccess,
        canEdit: (canWrite || canCreate) && writeAccess,
        canDelete: (canWrite || canCreate) && writeAccess,
      });
    }),
  };
}

export async function listAcoesPageAction(params?: {
  page?: number;
  q?: string;
  projetoId?: string;
  contextoId?: string;
  pageSize?: number;
  sort?: string;
  sortDir?: string;
}): Promise<
  ListPageMeta & {
    items: AcaoDTO[];
    canCreate: boolean;
    canWrite: boolean;
  }
> {
  const { scope, canCreate, canWrite } = await requireHierarchyRead();
  const pageSize = params?.pageSize ?? HIERARQUIA_PAGE_SIZE;
  const { page, skip, take } = parsePageInput(params?.page, pageSize);

  if (isEmptyScoped(scope)) {
    return { items: [], canCreate, canWrite, ...pageMeta(0, page, pageSize) };
  }

  const where = mergeWhere<Prisma.AcaoWhereInput>(
    acaoWhereFromScope(scope),
    searchAcaoWhere(params?.q),
    params?.projetoId ? { projetoId: params.projetoId } : undefined,
    params?.contextoId
      ? { projeto: { contextoId: params.contextoId } }
      : undefined,
  );

  const total = await prisma.acao.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const rows = await prisma.acao.findMany({
    where,
    include: ACAO_INCLUDE,
    orderBy: [acaoOrderBy(params?.sort, parseSortDir(params?.sortDir))],
    skip: (safePage - 1) * pageSize,
    take,
  });

  const counts = await countInscricoesByAcao(rows.map((o) => o.id));

  return {
    ...pageMeta(total, safePage, pageSize),
    canCreate,
    canWrite,
    items: rows.map((o) => {
      const writeAccess = hasScopeAccess(
        scope,
        {
          contextoId: o.projeto.contextoId,
          idProjeto: o.projetoId,
          idAcao: o.id,
        },
        { write: true },
      );
      return toAcaoDto(o, counts.get(o.id) ?? 0, {
        hasEditorAccess: writeAccess,
        canEdit: (canWrite || canCreate) && writeAccess,
        canDelete: (canWrite || canCreate) && writeAccess,
      });
    }),
  };
}

export async function listContextosSelectAction(params?: {
  q?: string;
  limit?: number;
  editableOnly?: boolean;
}): Promise<ContextoSelectOption[]> {
  const { scope } = await requireHierarchyRead();
  if (isEmptyScoped(scope)) return [];

  const limit = Math.min(
    Math.max(params?.limit ?? HIERARQUIA_SELECT_LIMIT, 1),
    500,
  );
  const where = mergeWhere<Prisma.ContextoWhereInput>(
    contextoWhereFromScope(scope),
    searchContextoWhere(params?.q),
  );

  const rows = await prisma.contexto.findMany({
    where,
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
    take: limit,
  });

  if (!params?.editableOnly) {
    return rows.map((c) => ({ id: c.id, nome: c.nome }));
  }

  return rows
    .filter((c) =>
      hasScopeAccess(scope, { contextoId: c.id }, { write: true }),
    )
    .map((c) => ({ id: c.id, nome: c.nome }));
}

export async function listProjetosSelectAction(params: {
  contextoId: string;
  q?: string;
  limit?: number;
}): Promise<ProjetoSelectOption[]> {
  const { scope } = await requireHierarchyRead();
  if (isEmptyScoped(scope) || !params.contextoId) return [];

  const limit = Math.min(
    Math.max(params.limit ?? HIERARQUIA_SELECT_LIMIT, 1),
    500,
  );
  const where = mergeWhere<Prisma.ProjetoWhereInput>(
    projetoWhereFromScope(scope),
    { contextoId: params.contextoId },
    searchProjetoWhere(params.q),
  );

  const rows = await prisma.projeto.findMany({
    where,
    select: { id: true, nome: true, pronac: true, contextoId: true },
    orderBy: { nome: "asc" },
    take: limit,
  });

  return rows.map((p) => ({
    id: p.id,
    nome: p.nome,
    pronac: p.pronac,
    contextoId: p.contextoId,
  }));
}

export async function listAcoesSelectAction(params: {
  projetoId: string;
  q?: string;
  limit?: number;
}): Promise<AcaoSelectOption[]> {
  const { scope } = await requireHierarchyRead();
  if (isEmptyScoped(scope) || !params.projetoId) return [];

  const limit = Math.min(
    Math.max(params.limit ?? HIERARQUIA_SELECT_LIMIT, 1),
    500,
  );
  const where = mergeWhere<Prisma.AcaoWhereInput>(
    acaoWhereFromScope(scope),
    { projetoId: params.projetoId },
    searchAcaoWhere(params.q),
  );

  const rows = await prisma.acao.findMany({
    where,
    select: {
      id: true,
      nome: true,
      projetoId: true,
      ofereceOnline: true,
      oferecePresencial: true,
      projeto: {
        select: {
          nome: true,
          pronac: true,
          proponente: true,
          ano: true,
          contextoId: true,
          contexto: { select: { nome: true } },
        },
      },
      territorios: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          nome: true,
          cidade: true,
          estado: true,
        },
      },
    },
    orderBy: { nome: "asc" },
    take: limit,
  });

  return rows.map((o) => ({
    id: o.id,
    nome: o.nome,
    projetoId: o.projetoId,
    projetoNome: o.projeto.nome,
    contextoId: o.projeto.contextoId,
    contextoNome: o.projeto.contexto?.nome ?? "",
    pronac: o.projeto.pronac,
    proponente: o.projeto.proponente,
    ano: o.projeto.ano,
    ofereceOnline: o.ofereceOnline,
    oferecePresencial: o.oferecePresencial,
    territorios: o.territorios,
  }));
}

/** Catálogo completo (territórios + aliases) para import/formulário. */
export async function getAcaoTerritorioCatalogAction(acaoId: string) {
  await requireAnyPermission([
    "contextos:read",
    "import:write",
    "formularios:write",
    "dashboard:access",
  ]);
  const acao = await prisma.acao.findUnique({
    where: { id: acaoId },
    select: {
      ofereceOnline: true,
      oferecePresencial: true,
      territorios: {
        orderBy: { ordem: "asc" },
        select: { id: true, nome: true, cidade: true, estado: true },
      },
      territorioAliases: {
        select: {
          rawNormalized: true,
          online: true,
          acaoTerritorioId: true,
          cidade: true,
          estado: true,
          territorio: true,
        },
      },
    },
  });
  if (!acao) return null;
  return {
    ofereceOnline: acao.ofereceOnline,
    oferecePresencial: acao.oferecePresencial,
    territorios: acao.territorios,
    aliases: acao.territorioAliases,
  };
}

export async function listHierarquiaAction(): Promise<{
  contextos: ContextoDTO[];
  projetos: ProjetoDTO[];
  acoes: AcaoDTO[];
  canCreate: boolean;
  canWrite: boolean;
}> {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("contextos:read") && !perms.has("import:write")) {
    throw new Error("Sem permissão");
  }
  const scope = await resolveDataScope(user.id);
  const canCreate =
    perms.has("contextos:create") || perms.has("import:write");
  const canWrite = perms.has("contextos:write");

  const emptyLimited =
    scope.mode !== "ALL" &&
    !(
      (scope.projetoIds?.length ?? 0) ||
      (scope.acaoIds?.length ?? 0) ||
      (scope.contextoIds?.length ?? 0)
    );

  if (emptyLimited) {
    return { contextos: [], projetos: [], acoes: [], canCreate, canWrite };
  }

  let contextos;
  let projetos;
  let acoes;

  if (scope.mode === "ALL") {
    [contextos, projetos, acoes] = await Promise.all([
      prisma.contexto.findMany({
        include: { _count: { select: { projetos: true } } },
        orderBy: { nome: "asc" },
      }),
      prisma.projeto.findMany({
        include: {
          contexto: { select: { nome: true } },
          _count: { select: { acoes: true } },
        },
        orderBy: { nome: "asc" },
      }),
      prisma.acao.findMany({
        include: ACAO_INCLUDE,
        orderBy: { nome: "asc" },
      }),
    ]);
  } else {
    acoes = (scope.acaoIds?.length ?? 0)
      ? await prisma.acao.findMany({
          where: { id: { in: scope.acaoIds! } },
          include: ACAO_INCLUDE,
          orderBy: { nome: "asc" },
        })
      : [];
    const projetoIds = [
      ...new Set([
        ...(scope.projetoIds ?? []),
        ...acoes.map((o) => o.projetoId),
      ]),
    ];
    projetos = projetoIds.length
      ? await prisma.projeto.findMany({
          where: { id: { in: projetoIds } },
          include: {
            contexto: { select: { nome: true } },
            _count: { select: { acoes: true } },
          },
          orderBy: { nome: "asc" },
        })
      : [];
    const contextoIds = [
      ...new Set([
        ...(scope.contextoIds ?? []),
        ...projetos.map((p) => p.contextoId),
      ]),
    ];
    contextos = contextoIds.length
      ? await prisma.contexto.findMany({
          where: { id: { in: contextoIds } },
          include: { _count: { select: { projetos: true } } },
          orderBy: { nome: "asc" },
        })
      : [];
  }

  const contextosF = contextos;
  const projetosF = projetos;
  const acoesF = acoes;

  const [ctxCounts, projCounts, ofCounts] = await Promise.all([
    countInscricoesByContexto(contextosF.map((c) => c.id)),
    countInscricoesByProjeto(projetosF.map((p) => p.id)),
    countInscricoesByAcao(acoesF.map((o) => o.id)),
  ]);

  return {
    contextos: contextosF.map((c) => {
      const writeAccess = hasScopeAccess(
        scope,
        { contextoId: c.id },
        { write: true },
      );
      return toContextoDto(c, ctxCounts.get(c.id) ?? 0, {
        hasEditorAccess: writeAccess,
        canEdit: (canWrite || canCreate) && writeAccess,
        canDelete: (canWrite || canCreate) && writeAccess,
      });
    }),
    projetos: projetosF.map((p) => {
      const writeAccess = hasScopeAccess(
        scope,
        { contextoId: p.contextoId, idProjeto: p.id },
        { write: true },
      );
      return toProjetoDto(p, projCounts.get(p.id) ?? 0, {
        hasEditorAccess: writeAccess,
        canEdit: (canWrite || canCreate) && writeAccess,
        canDelete: (canWrite || canCreate) && writeAccess,
      });
    }),
    acoes: acoesF.map((o) => {
      const writeAccess = hasScopeAccess(
        scope,
        {
          contextoId: o.projeto.contextoId,
          idProjeto: o.projetoId,
          idAcao: o.id,
        },
        { write: true },
      );
      return toAcaoDto(o, ofCounts.get(o.id) ?? 0, {
        hasEditorAccess: writeAccess,
        canEdit: (canWrite || canCreate) && writeAccess,
        canDelete: (canWrite || canCreate) && writeAccess,
      });
    }),
    canCreate,
    canWrite,
  };
}

export async function createContextoAction(
  input: ContextoInput,
): Promise<{ ok: true; contexto: ContextoDTO } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:create",
    "import:write",
  ]);
  const nome = (input.nome ?? "").trim();
  if (!nome) return { ok: false, error: "Informe o nome do contexto." };
  const created = await prisma.contexto.create({
    data: { nome },
    include: { _count: { select: { projetos: true } } },
  });

  // Quem cria em escopo LIMITED precisa ver/editar o recurso novo.
  if (!actor.isSuperAdmin && actor.dataScopeMode === "LIMITED") {
    await prisma.userDataScope.upsert({
      where: {
        userId_kind_resourceId: {
          userId: actor.id,
          kind: "CONTEXTO",
          resourceId: created.id,
        },
      },
      create: {
        userId: actor.id,
        kind: "CONTEXTO",
        resourceId: created.id,
        access: "EDITOR",
      },
      update: { access: "EDITOR" },
    });
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: "contexto.created",
    entityType: "Contexto",
    entityId: created.id,
    meta: { nome: created.nome },
  });
  return { ok: true, contexto: toContextoDto(created, 0, { hasEditorAccess: true, canEdit: true, canDelete: true }) };
}

export async function updateContextoAction(
  id: string,
  input: ContextoInput,
): Promise<{ ok: true; contexto: ContextoDTO } | { ok: false; error: string }> {
  const actor = await requirePermission("contextos:write");
  const nome = (input.nome ?? "").trim();
  if (!nome) return { ok: false, error: "Informe o nome do contexto." };
  const existing = await prisma.contexto.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Contexto não encontrado." };

  const allowed = await assertDataAccess(
    actor.id,
    { contextoId: id },
    { write: true },
  );
  if (!allowed) return { ok: false, error: "Fora do seu acesso a este contexto." };

  const updated = await prisma.contexto.update({
    where: { id },
    data: { nome },
    include: { _count: { select: { projetos: true } } },
  });
  await prisma.inscricao.updateMany({
    where: { contextoId: id },
    data: { nomeContexto: updated.nome },
  });
  const insc = await prisma.inscricao.count({ where: { contextoId: id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "contexto.updated",
    entityType: "Contexto",
    entityId: id,
    meta: { nome: updated.nome },
  });
  return {
    ok: true,
    contexto: toContextoDto(updated, insc, { hasEditorAccess: true, canEdit: true, canDelete: true }),
  };
}

export async function deleteContextoAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:create",
    "contextos:write",
  ]);
  const existing = await prisma.contexto.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Contexto não encontrado." };

  const allowed = await assertDataAccess(
    actor.id,
    { contextoId: id },
    { write: true },
  );
  if (!allowed) {
    return { ok: false, error: "Sem permissão de edição neste contexto." };
  }

  const projetos = await prisma.projeto.count({ where: { contextoId: id } });
  if (projetos > 0) {
    return {
      ok: false,
      error:
        "Não é possível excluir: há projetos vinculados. Remova-os antes (se estiverem vazios).",
    };
  }
  const insc = await prisma.inscricao.count({ where: { contextoId: id } });
  if (insc > 0) {
    return {
      ok: false,
      error: "Não é possível excluir: há inscrições vinculadas a este contexto.",
    };
  }
  await prisma.contexto.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "contexto.deleted",
    entityType: "Contexto",
    entityId: id,
    meta: { nome: existing.nome },
  });
  return { ok: true };
}

export async function createProjetoAction(
  input: ProjetoInput,
): Promise<{ ok: true; projeto: ProjetoDTO } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:create",
    "import:write",
  ]);
  const nome = (input.nome ?? "").trim();
  if (!input.contextoId?.trim()) return { ok: false, error: "Selecione um contexto." };
  if (!nome) return { ok: false, error: "Informe o nome do projeto." };
  const ano = normalizeAnoProjeto(input.ano ?? "");
  if (ano && !/^\d{4}$/.test(ano)) {
    return { ok: false, error: "O ano deve ter 4 dígitos (ex.: 2025)." };
  }
  const ctx = await prisma.contexto.findUnique({ where: { id: input.contextoId } });
  if (!ctx) return { ok: false, error: "Contexto não encontrado." };
  const allowed = await assertDataAccess(
    actor.id,
    { contextoId: input.contextoId },
    { write: true },
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Você precisa de acesso de edição neste contexto para cadastrar projetos.",
    };
  }

  const id = await nextIdProjeto();
  const created = await prisma.projeto.create({
    data: {
      id,
      nome,
      pronac: (input.pronac ?? "").trim(),
      proponente: await proponenteParaGravar(input.proponente ?? ""),
      ano,
      contextoId: input.contextoId,
    },
    include: {
      contexto: { select: { nome: true } },
      _count: { select: { acoes: true } },
    },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "projeto.created",
    entityType: "Projeto",
    entityId: created.id,
    meta: { nome: created.nome, contextoId: created.contextoId },
  });
  return {
    ok: true,
    projeto: toProjetoDto(created, 0, { hasEditorAccess: true, canEdit: true, canDelete: true }),
  };
}

export async function updateProjetoAction(
  id: string,
  input: ProjetoInput,
): Promise<{ ok: true; projeto: ProjetoDTO } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:write",
    "contextos:create",
    "import:write",
  ]);
  const existing = await prisma.projeto.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Projeto não encontrado." };
  if (!input.nome.trim()) return { ok: false, error: "Informe o nome do projeto." };
  const ano = normalizeAnoProjeto(input.ano ?? "");
  if (ano && !/^\d{4}$/.test(ano)) {
    return { ok: false, error: "O ano deve ter 4 dígitos (ex.: 2025)." };
  }
  if (input.contextoId !== existing.contextoId) {
    const ctx = await prisma.contexto.findUnique({
      where: { id: input.contextoId },
    });
    if (!ctx) return { ok: false, error: "Contexto não encontrado." };
    const allowedDest = await assertDataAccess(
      actor.id,
      { contextoId: input.contextoId },
      { write: true },
    );
    if (!allowedDest) {
      return {
        ok: false,
        error: "Sem permissão de edição no contexto de destino.",
      };
    }
  }

  const allowed = await assertDataAccess(
    actor.id,
    { contextoId: existing.contextoId, idProjeto: id },
    { write: true },
  );
  if (!allowed) return { ok: false, error: "Sem permissão de edição neste projeto." };

  const updated = await prisma.projeto.update({
    where: { id },
    data: {
      nome: input.nome.trim(),
      pronac: (input.pronac ?? "").trim(),
      proponente: await proponenteParaGravar(input.proponente ?? "", id),
      ano,
      contextoId: input.contextoId,
    },
    include: {
      contexto: { select: { nome: true } },
      _count: { select: { acoes: true } },
    },
  });

  await prisma.inscricao.updateMany({
    where: { idProjeto: id },
    data: {
      contextoId: updated.contextoId,
      nomeContexto: updated.contexto.nome,
      nomeProjeto: updated.nome,
      pronac: updated.pronac,
      proponente: updated.proponente,
      identificacaoAnoProjeto: updated.ano,
    },
  });

  const insc = await prisma.inscricao.count({ where: { idProjeto: id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "projeto.updated",
    entityType: "Projeto",
    entityId: id,
    meta: { nome: updated.nome },
  });
  return {
    ok: true,
    projeto: toProjetoDto(updated, insc, { hasEditorAccess: true, canEdit: true, canDelete: true }),
  };
}

/** Move projeto para outro contexto (atualiza inscrições denormalizadas). */
export async function moveProjetoContextoAction(
  projetoId: string,
  contextoId: string,
): Promise<{ ok: true; contextoNome: string } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:write",
    "contextos:create",
    "import:write",
  ]);
  const id = projetoId.trim();
  const destId = contextoId.trim();
  if (!id || !destId) {
    return { ok: false, error: "Projeto ou contexto inválido." };
  }

  const existing = await prisma.projeto.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Projeto não encontrado." };
  if (existing.contextoId === destId) {
    const ctx = await prisma.contexto.findUnique({
      where: { id: destId },
      select: { nome: true },
    });
    return { ok: true, contextoNome: ctx?.nome ?? "" };
  }

  const dest = await prisma.contexto.findUnique({ where: { id: destId } });
  if (!dest) return { ok: false, error: "Contexto não encontrado." };

  const allowedDest = await assertDataAccess(
    actor.id,
    { contextoId: destId },
    { write: true },
  );
  if (!allowedDest) {
    return { ok: false, error: "Sem permissão de edição no contexto de destino." };
  }

  const allowed = await assertDataAccess(
    actor.id,
    { contextoId: existing.contextoId, idProjeto: id },
    { write: true },
  );
  if (!allowed) {
    return { ok: false, error: "Sem permissão de edição neste projeto." };
  }

  await prisma.projeto.update({
    where: { id },
    data: { contextoId: destId },
  });

  await prisma.inscricao.updateMany({
    where: { idProjeto: id },
    data: {
      contextoId: dest.id,
      nomeContexto: dest.nome,
    },
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "projeto.moved_contexto",
    entityType: "Projeto",
    entityId: id,
    meta: {
      fromContextoId: existing.contextoId,
      toContextoId: dest.id,
      toContextoNome: dest.nome,
    },
  });

  return { ok: true, contextoNome: dest.nome };
}

export async function deleteProjetoAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:create",
    "contextos:write",
  ]);
  const existing = await prisma.projeto.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Projeto não encontrado." };

  const allowed = await assertDataAccess(
    actor.id,
    {
      contextoId: existing.contextoId,
      idProjeto: id,
    },
    { write: true },
  );
  if (!allowed) {
    return { ok: false, error: "Sem permissão de edição neste projeto." };
  }

  const acoes = await prisma.acao.count({ where: { projetoId: id } });
  if (acoes > 0) {
    return {
      ok: false,
      error:
        "Não é possível excluir: há ações vinculadas. Remova-as antes (se estiverem vazias).",
    };
  }
  const insc = await prisma.inscricao.count({ where: { idProjeto: id } });
  if (insc > 0) {
    return {
      ok: false,
      error: "Não é possível excluir: há inscrições vinculadas a este projeto.",
    };
  }
  await prisma.projeto.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "projeto.deleted",
    entityType: "Projeto",
    entityId: id,
    meta: { nome: existing.nome },
  });
  return { ok: true };
}

export async function createAcaoAction(
  input: AcaoInput,
): Promise<{ ok: true; acao: AcaoDTO } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:create",
    "import:write",
  ]);
  if (!input.projetoId.trim())
    return { ok: false, error: "Selecione um projeto." };
  if (!input.nome.trim()) return { ok: false, error: "Informe o nome da ação." };

  const ofereceOnline = Boolean(input.ofereceOnline);
  const oferecePresencial =
    input.oferecePresencial === undefined
      ? !ofereceOnline
      : Boolean(input.oferecePresencial);
  const modalidadeError = validateAcaoModalidade({
    ...input,
    ofereceOnline,
    oferecePresencial,
  });
  if (modalidadeError) return { ok: false, error: modalidadeError };

  const projeto = await prisma.projeto.findUnique({
    where: { id: input.projetoId },
    include: { contexto: { select: { nome: true } } },
  });
  if (!projeto) return { ok: false, error: "Projeto não encontrado." };

  const allowed = await assertDataAccess(
    actor.id,
    {
      contextoId: projeto.contextoId,
      idProjeto: projeto.id,
    },
    { write: true },
  );
  if (!allowed) {
    return {
      ok: false,
      error:
        "Você precisa de acesso de edição neste projeto para cadastrar ações.",
    };
  }

  const tipoId = await resolveAcaoTipoId(input.tipoId);
  if (!tipoId) return { ok: false, error: "Escolha um tipo de ação válido." };

  const id = await nextIdAcao();
  const created = await prisma.acao.create({
    data: {
      id,
      nome: input.nome.trim(),
      projetoId: input.projetoId,
      tipoId,
      ofereceOnline,
      oferecePresencial,
    },
    include: ACAO_INCLUDE,
  });
  await replaceAcaoTerritorios(created.id, {
    ...input,
    ofereceOnline,
    oferecePresencial,
  });
  const withTerr = await prisma.acao.findUnique({
    where: { id: created.id },
    include: ACAO_INCLUDE,
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "acao.created",
    entityType: "Acao",
    entityId: created.id,
    meta: { nome: created.nome, projetoId: created.projetoId },
  });
  return {
    ok: true,
    acao: toAcaoDto(withTerr ?? created, 0, {
      hasEditorAccess: true,
      canEdit: true,
      canDelete: true,
    }),
  };
}

export async function updateAcaoAction(
  id: string,
  input: AcaoInput,
): Promise<{ ok: true; acao: AcaoDTO } | { ok: false; error: string }> {
  const actor = await requirePermission("contextos:write");
  const existing = await prisma.acao.findUnique({
    where: { id },
    include: { projeto: { select: { contextoId: true } } },
  });
  if (!existing) return { ok: false, error: "Ação não encontrada." };
  if (!input.nome.trim()) return { ok: false, error: "Informe o nome da ação." };

  const ofereceOnline = Boolean(input.ofereceOnline);
  const oferecePresencial =
    input.oferecePresencial === undefined
      ? true
      : Boolean(input.oferecePresencial);
  const modalidadeError = validateAcaoModalidade({
    ...input,
    ofereceOnline,
    oferecePresencial,
  });
  if (modalidadeError) return { ok: false, error: modalidadeError };

  if (input.projetoId !== existing.projetoId) {
    const projeto = await prisma.projeto.findUnique({
      where: { id: input.projetoId },
    });
    if (!projeto) return { ok: false, error: "Projeto não encontrado." };
    const allowedDest = await assertDataAccess(
      actor.id,
      { contextoId: projeto.contextoId, idProjeto: projeto.id },
      { write: true },
    );
    if (!allowedDest) {
      return {
        ok: false,
        error: "Sem permissão de edição no projeto de destino.",
      };
    }
  }

  const allowed = await assertDataAccess(
    actor.id,
    {
      contextoId: existing.projeto.contextoId,
      idProjeto: existing.projetoId,
      idAcao: id,
    },
    { write: true },
  );
  if (!allowed) return { ok: false, error: "Sem permissão de edição nesta ação." };

  const tipoId = await resolveAcaoTipoId(input.tipoId ?? existing.tipoId);
  if (!tipoId) return { ok: false, error: "Escolha um tipo de ação válido." };

  const updated = await prisma.acao.update({
    where: { id },
    data: {
      nome: input.nome.trim(),
      projetoId: input.projetoId,
      tipoId,
      ofereceOnline,
      oferecePresencial,
    },
    include: ACAO_INCLUDE,
  });

  await replaceAcaoTerritorios(id, {
    ...input,
    ofereceOnline,
    oferecePresencial,
  });

  const withTerr = await prisma.acao.findUnique({
    where: { id },
    include: ACAO_INCLUDE,
  });

  await prisma.inscricao.updateMany({
    where: { idAcao: id },
    data: {
      idProjeto: updated.projetoId,
      nomeAcao: updated.nome,
      nomeProjeto: updated.projeto.nome,
      pronac: updated.projeto.pronac,
      proponente: updated.projeto.proponente,
      identificacaoAnoProjeto: updated.projeto.ano,
      contextoId: updated.projeto.contextoId,
      nomeContexto: updated.projeto.contexto?.nome ?? "",
    },
  });

  const insc = await prisma.inscricao.count({ where: { idAcao: id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "acao.updated",
    entityType: "Acao",
    entityId: id,
    meta: { nome: updated.nome },
  });
  return {
    ok: true,
    acao: toAcaoDto(withTerr ?? updated, insc, {
      hasEditorAccess: true,
      canEdit: true,
      canDelete: true,
    }),
  };
}

export async function upsertAcaoTerritorioAliasAction(input: {
  acaoId: string;
  raw: string;
  online?: boolean;
  acaoTerritorioId?: string | null;
  cidade?: string;
  estado?: string;
  territorio?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:write",
    "import:write",
  ]);
  const acao = await prisma.acao.findUnique({
    where: { id: input.acaoId },
    include: { projeto: { select: { contextoId: true } } },
  });
  if (!acao) return { ok: false, error: "Ação não encontrada." };
  const allowed = await assertDataAccess(
    actor.id,
    {
      contextoId: acao.projeto.contextoId,
      idProjeto: acao.projetoId,
      idAcao: acao.id,
    },
    { write: true },
  );
  if (!allowed) return { ok: false, error: "Sem permissão nesta ação." };

  const rawNormalized = normalizeTerritorioRawKey(input.raw);
  if (!rawNormalized) return { ok: false, error: "Informe o texto de origem." };

  await prisma.acaoTerritorioAlias.upsert({
    where: {
      acaoId_rawNormalized: {
        acaoId: input.acaoId,
        rawNormalized,
      },
    },
    create: {
      acaoId: input.acaoId,
      rawNormalized,
      online: Boolean(input.online),
      acaoTerritorioId: input.acaoTerritorioId || null,
      cidade: String(input.cidade ?? "").trim(),
      estado: input.estado ? normalizeUf(input.estado) : "",
      territorio: String(input.territorio ?? "").trim(),
    },
    update: {
      online: Boolean(input.online),
      acaoTerritorioId: input.acaoTerritorioId || null,
      cidade: String(input.cidade ?? "").trim(),
      estado: input.estado ? normalizeUf(input.estado) : "",
      territorio: String(input.territorio ?? "").trim(),
    },
  });
  return { ok: true };
}

export async function deleteAcaoAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:create",
    "contextos:write",
  ]);
  const existing = await prisma.acao.findUnique({
    where: { id },
    include: { projeto: { select: { contextoId: true, nome: true } } },
  });
  if (!existing) return { ok: false, error: "Ação não encontrada." };

  const allowed = await assertDataAccess(
    actor.id,
    {
      contextoId: existing.projeto.contextoId,
      idProjeto: existing.projetoId,
      idAcao: id,
    },
    { write: true },
  );
  if (!allowed) {
    return { ok: false, error: "Sem permissão de edição nesta ação." };
  }

  const insc = await prisma.inscricao.count({ where: { idAcao: id } });
  if (insc > 0) {
    return {
      ok: false,
      error: "Não é possível excluir: há inscrições vinculadas a esta ação.",
    };
  }
  await prisma.acao.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "acao.deleted",
    entityType: "Acao",
    entityId: id,
    meta: { nome: existing.nome },
  });
  return { ok: true };
}

/** @deprecated Prefer listAcoesSelectAction({ projetoId }) */
export async function listAcoesParaImportAction(projetoId?: string) {
  await requireAnyPermission(["contextos:create", "import:write", "contextos:read"]);
  if (!projetoId) return [];
  return listAcoesSelectAction({ projetoId });
}
