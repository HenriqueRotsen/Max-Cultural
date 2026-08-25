"use server";

import { requireAuth, requirePermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import type {
  ContextoDTO,
  ContextoInput,
  OficinaDTO,
  OficinaInput,
  ProjetoDTO,
  ProjetoInput,
} from "@/lib/contexto";
import { nextIdOficina, nextIdProjeto } from "@/lib/ids";
import { normalizeAnoProjeto } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { assertDataAccess, hasScopeAccess, resolveDataScope, contextoWhereFromScope, projetoWhereFromScope, oficinaWhereFromScope } from "@/lib/data-scope";
import type { Prisma } from "@prisma/client";
import {
  HIERARQUIA_PAGE_SIZE,
  HIERARQUIA_SELECT_LIMIT,
  type ContextoSelectOption,
  type OficinaSelectOption,
  type ProjetoSelectOption,
} from "@/lib/hierarchy-list";
import {
  contextoOrderBy,
  oficinaOrderBy,
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
    _count?: { oficinas: number };
  },
  inscricoesCount: number,
  flags: { hasEditorAccess: boolean; canEdit: boolean; canDelete: boolean },
): ProjetoDTO {
  const oficinasCount = p._count?.oficinas ?? 0;
  return {
    id: p.id,
    nome: p.nome,
    pronac: p.pronac,
    proponente: p.proponente,
    ano: p.ano,
    contextoId: p.contextoId,
    contextoNome: p.contexto?.nome ?? "",
    oficinasCount,
    inscricoesCount,
    hasEditorAccess: flags.hasEditorAccess,
    canEdit: flags.canEdit,
    canDelete:
      flags.canDelete && oficinasCount === 0 && inscricoesCount === 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function toOficinaDto(
  o: {
    id: string;
    nome: string;
    projetoId: string;
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
  },
  inscricoesCount: number,
  flags: { hasEditorAccess: boolean; canEdit: boolean; canDelete: boolean },
): OficinaDTO {
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
    inscricoesCount,
    hasEditorAccess: flags.hasEditorAccess,
    canEdit: flags.canEdit,
    canDelete: flags.canDelete && inscricoesCount === 0,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
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

async function countInscricoesByOficina(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await prisma.inscricao.groupBy({
    by: ["idOficina"],
    where: { idOficina: { in: ids } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.idOficina, r._count._all]));
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

function searchOficinaWhere(q?: string): Prisma.OficinaWhereInput {
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
      (scope.oficinaIds?.length ?? 0)
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
      _count: { select: { oficinas: true } },
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

export async function listOficinasPageAction(params?: {
  page?: number;
  q?: string;
  projetoId?: string;
  contextoId?: string;
  pageSize?: number;
  sort?: string;
  sortDir?: string;
}): Promise<
  ListPageMeta & {
    items: OficinaDTO[];
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

  const where = mergeWhere<Prisma.OficinaWhereInput>(
    oficinaWhereFromScope(scope),
    searchOficinaWhere(params?.q),
    params?.projetoId ? { projetoId: params.projetoId } : undefined,
    params?.contextoId
      ? { projeto: { contextoId: params.contextoId } }
      : undefined,
  );

  const total = await prisma.oficina.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const rows = await prisma.oficina.findMany({
    where,
    include: {
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
    },
    orderBy: [oficinaOrderBy(params?.sort, parseSortDir(params?.sortDir))],
    skip: (safePage - 1) * pageSize,
    take,
  });

  const counts = await countInscricoesByOficina(rows.map((o) => o.id));

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
          idOficina: o.id,
        },
        { write: true },
      );
      return toOficinaDto(o, counts.get(o.id) ?? 0, {
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

export async function listOficinasSelectAction(params: {
  projetoId: string;
  q?: string;
  limit?: number;
}): Promise<OficinaSelectOption[]> {
  const { scope } = await requireHierarchyRead();
  if (isEmptyScoped(scope) || !params.projetoId) return [];

  const limit = Math.min(
    Math.max(params.limit ?? HIERARQUIA_SELECT_LIMIT, 1),
    500,
  );
  const where = mergeWhere<Prisma.OficinaWhereInput>(
    oficinaWhereFromScope(scope),
    { projetoId: params.projetoId },
    searchOficinaWhere(params.q),
  );

  const rows = await prisma.oficina.findMany({
    where,
    select: {
      id: true,
      nome: true,
      projetoId: true,
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
  }));
}

export async function listHierarquiaAction(): Promise<{
  contextos: ContextoDTO[];
  projetos: ProjetoDTO[];
  oficinas: OficinaDTO[];
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
      (scope.oficinaIds?.length ?? 0) ||
      (scope.contextoIds?.length ?? 0)
    );

  if (emptyLimited) {
    return { contextos: [], projetos: [], oficinas: [], canCreate, canWrite };
  }

  let contextos;
  let projetos;
  let oficinas;

  if (scope.mode === "ALL") {
    [contextos, projetos, oficinas] = await Promise.all([
      prisma.contexto.findMany({
        include: { _count: { select: { projetos: true } } },
        orderBy: { nome: "asc" },
      }),
      prisma.projeto.findMany({
        include: {
          contexto: { select: { nome: true } },
          _count: { select: { oficinas: true } },
        },
        orderBy: { nome: "asc" },
      }),
      prisma.oficina.findMany({
        include: {
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
        },
        orderBy: { nome: "asc" },
      }),
    ]);
  } else {
    oficinas = (scope.oficinaIds?.length ?? 0)
      ? await prisma.oficina.findMany({
          where: { id: { in: scope.oficinaIds! } },
          include: {
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
          },
          orderBy: { nome: "asc" },
        })
      : [];
    const projetoIds = [
      ...new Set([
        ...(scope.projetoIds ?? []),
        ...oficinas.map((o) => o.projetoId),
      ]),
    ];
    projetos = projetoIds.length
      ? await prisma.projeto.findMany({
          where: { id: { in: projetoIds } },
          include: {
            contexto: { select: { nome: true } },
            _count: { select: { oficinas: true } },
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
  const oficinasF = oficinas;

  const [ctxCounts, projCounts, ofCounts] = await Promise.all([
    countInscricoesByContexto(contextosF.map((c) => c.id)),
    countInscricoesByProjeto(projetosF.map((p) => p.id)),
    countInscricoesByOficina(oficinasF.map((o) => o.id)),
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
    oficinas: oficinasF.map((o) => {
      const writeAccess = hasScopeAccess(
        scope,
        {
          contextoId: o.projeto.contextoId,
          idProjeto: o.projetoId,
          idOficina: o.id,
        },
        { write: true },
      );
      return toOficinaDto(o, ofCounts.get(o.id) ?? 0, {
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
  if (!input._fromImport) {
    return {
      ok: false,
      error:
        "Projetos são criados automaticamente pelo MAX Origem. Edite o contexto de um projeto existente ou crie oficinas.",
    };
  }

  const actor = await requireAnyPermission([
    "contextos:create",
    "import:write",
  ]);
  if (!input.contextoId.trim())
    return { ok: false, error: "Selecione um contexto." };
  if (!input.nome.trim()) return { ok: false, error: "Informe o nome do projeto." };
  if (!input.pronac.trim()) return { ok: false, error: "Informe o PRONAC." };
  const ano = normalizeAnoProjeto(input.ano ?? "");
  if (ano && !/^\d{4}$/.test(ano)) {
    return { ok: false, error: "O ano deve ter 4 dígitos (ex.: 2025)." };
  }
  const ctx = await prisma.contexto.findUnique({
    where: { id: input.contextoId },
  });
  if (!ctx) return { ok: false, error: "Contexto não encontrado." };

  const allowed = await assertDataAccess(
    actor.id,
    { contextoId: input.contextoId },
    { write: true },
  );
  if (!allowed) {
    return {
      ok: false,
      error:
        "Você precisa de acesso de edição neste contexto para cadastrar projetos.",
    };
  }

  const id = await nextIdProjeto();
  const created = await prisma.projeto.create({
    data: {
      id,
      nome: input.nome.trim(),
      pronac: input.pronac.trim(),
      proponente: (input.proponente ?? "").trim(),
      ano,
      contextoId: input.contextoId,
    },
    include: {
      contexto: { select: { nome: true } },
      _count: { select: { oficinas: true } },
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
  if (!input.pronac.trim()) return { ok: false, error: "Informe o PRONAC." };
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
      pronac: input.pronac.trim(),
      proponente: (input.proponente ?? "").trim(),
      ano,
      contextoId: input.contextoId,
    },
    include: {
      contexto: { select: { nome: true } },
      _count: { select: { oficinas: true } },
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

  const oficinas = await prisma.oficina.count({ where: { projetoId: id } });
  if (oficinas > 0) {
    return {
      ok: false,
      error:
        "Não é possível excluir: há oficinas vinculadas. Remova-as antes (se estiverem vazias).",
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

export async function createOficinaAction(
  input: OficinaInput,
): Promise<{ ok: true; oficina: OficinaDTO } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:create",
    "import:write",
  ]);
  if (!input.projetoId.trim())
    return { ok: false, error: "Selecione um projeto." };
  if (!input.nome.trim()) return { ok: false, error: "Informe o nome da oficina." };
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
        "Você precisa de acesso de edição neste projeto para cadastrar oficinas.",
    };
  }

  const id = await nextIdOficina();
  const created = await prisma.oficina.create({
    data: {
      id,
      nome: input.nome.trim(),
      projetoId: input.projetoId,
    },
    include: {
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
    },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "oficina.created",
    entityType: "Oficina",
    entityId: created.id,
    meta: { nome: created.nome, projetoId: created.projetoId },
  });
  return {
    ok: true,
    oficina: toOficinaDto(created, 0, { hasEditorAccess: true, canEdit: true, canDelete: true }),
  };
}

export async function updateOficinaAction(
  id: string,
  input: OficinaInput,
): Promise<{ ok: true; oficina: OficinaDTO } | { ok: false; error: string }> {
  const actor = await requirePermission("contextos:write");
  const existing = await prisma.oficina.findUnique({
    where: { id },
    include: { projeto: { select: { contextoId: true } } },
  });
  if (!existing) return { ok: false, error: "Oficina não encontrada." };
  if (!input.nome.trim()) return { ok: false, error: "Informe o nome da oficina." };
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
      idOficina: id,
    },
    { write: true },
  );
  if (!allowed) return { ok: false, error: "Sem permissão de edição nesta oficina." };

  const updated = await prisma.oficina.update({
    where: { id },
    data: {
      nome: input.nome.trim(),
      projetoId: input.projetoId,
    },
    include: {
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
    },
  });

  await prisma.inscricao.updateMany({
    where: { idOficina: id },
    data: {
      idProjeto: updated.projetoId,
      nomeOficina: updated.nome,
      nomeProjeto: updated.projeto.nome,
      pronac: updated.projeto.pronac,
      proponente: updated.projeto.proponente,
      identificacaoAnoProjeto: updated.projeto.ano,
      contextoId: updated.projeto.contextoId,
      nomeContexto: updated.projeto.contexto?.nome ?? "",
    },
  });

  const insc = await prisma.inscricao.count({ where: { idOficina: id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "oficina.updated",
    entityType: "Oficina",
    entityId: id,
    meta: { nome: updated.nome },
  });
  return {
    ok: true,
    oficina: toOficinaDto(updated, insc, { hasEditorAccess: true, canEdit: true, canDelete: true }),
  };
}

export async function deleteOficinaAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAnyPermission([
    "contextos:create",
    "contextos:write",
  ]);
  const existing = await prisma.oficina.findUnique({
    where: { id },
    include: { projeto: { select: { contextoId: true, nome: true } } },
  });
  if (!existing) return { ok: false, error: "Oficina não encontrada." };

  const allowed = await assertDataAccess(
    actor.id,
    {
      contextoId: existing.projeto.contextoId,
      idProjeto: existing.projetoId,
      idOficina: id,
    },
    { write: true },
  );
  if (!allowed) {
    return { ok: false, error: "Sem permissão de edição nesta oficina." };
  }

  const insc = await prisma.inscricao.count({ where: { idOficina: id } });
  if (insc > 0) {
    return {
      ok: false,
      error: "Não é possível excluir: há inscrições vinculadas a esta oficina.",
    };
  }
  await prisma.oficina.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "oficina.deleted",
    entityType: "Oficina",
    entityId: id,
    meta: { nome: existing.nome },
  });
  return { ok: true };
}

/** @deprecated Prefer listOficinasSelectAction({ projetoId }) */
export async function listOficinasParaImportAction(projetoId?: string) {
  await requireAnyPermission(["contextos:create", "import:write", "contextos:read"]);
  if (!projetoId) return [];
  return listOficinasSelectAction({ projetoId });
}
