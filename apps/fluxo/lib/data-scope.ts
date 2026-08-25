import { cache } from "react";
import type { DataScopeMode, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  accessFromDb,
  scopeKey,
  type DataScopeAccess,
  type DataScopeKind,
  type ScopeAccessLevel,
} from "@/lib/data-scope-shared";

export type {
  ScopeAccessLevel,
  ScopeEntry,
} from "@/lib/data-scope-shared";
export {
  scopeKey,
  accessToDb,
  accessFromDb,
  compactScopeEntries,
} from "@/lib/data-scope-shared";

export type DataScopeResolved = {
  mode: DataScopeMode;
  /** null = ALL (sem filtro) */
  contextoIds: string[] | null;
  projetoIds: string[] | null;
  oficinaIds: string[] | null;
  /** acesso efetivo por recurso (após herança) */
  accessByKey: Map<string, ScopeAccessLevel>;
};

function canRead(level: ScopeAccessLevel | undefined) {
  return level === "viewer" || level === "editor";
}

function canWrite(level: ScopeAccessLevel | undefined) {
  return level === "editor";
}

type ScopeRow = {
  kind: DataScopeKind | string;
  resourceId: string;
  access: DataScopeAccess | string;
};

const ALL_SCOPE: DataScopeResolved = {
  mode: "ALL",
  contextoIds: null,
  projetoIds: null,
  oficinaIds: null,
  accessByKey: new Map(),
};

/**
 * Expande só a subárvore relevante aos escopos explícitos
 * (evita carregar todos os projetos/oficinas da base).
 */
async function resolveLimitedFromEntries(
  entries: ScopeRow[],
): Promise<DataScopeResolved> {
  const explicit = new Map<string, ScopeAccessLevel>();
  for (const s of entries) {
    explicit.set(
      scopeKey(s.kind as DataScopeKind, s.resourceId),
      accessFromDb(s.access as DataScopeAccess),
    );
  }

  const seedCtxIds = entries
    .filter((s) => s.kind === "CONTEXTO")
    .map((s) => s.resourceId);
  const seedProjIds = entries
    .filter((s) => s.kind === "PROJETO")
    .map((s) => s.resourceId);
  const seedOfIds = entries
    .filter((s) => s.kind === "OFICINA")
    .map((s) => s.resourceId);

  const projetoOr: Prisma.ProjetoWhereInput[] = [];
  if (seedCtxIds.length) projetoOr.push({ contextoId: { in: seedCtxIds } });
  if (seedProjIds.length) projetoOr.push({ id: { in: seedProjIds } });
  if (seedOfIds.length) {
    projetoOr.push({ oficinas: { some: { id: { in: seedOfIds } } } });
  }

  const projetos =
    projetoOr.length > 0
      ? await prisma.projeto.findMany({
          where: { OR: projetoOr },
          select: { id: true, contextoId: true },
        })
      : [];

  const projetoIdsSeed = projetos.map((p) => p.id);
  const oficinaOr: Prisma.OficinaWhereInput[] = [];
  if (projetoIdsSeed.length) {
    oficinaOr.push({ projetoId: { in: projetoIdsSeed } });
  }
  if (seedOfIds.length) oficinaOr.push({ id: { in: seedOfIds } });

  const oficinas =
    oficinaOr.length > 0
      ? await prisma.oficina.findMany({
          where: { OR: oficinaOr },
          select: { id: true, projetoId: true },
        })
      : [];

  const accessByKey = new Map<string, ScopeAccessLevel>();
  const contextoIds = new Set<string>();

  for (const s of entries) {
    if (s.kind === "CONTEXTO") {
      const level = accessFromDb(s.access as DataScopeAccess);
      accessByKey.set(scopeKey("CONTEXTO", s.resourceId), level);
      if (canRead(level)) contextoIds.add(s.resourceId);
    }
  }

  const projetoIds = new Set<string>();
  for (const p of projetos) {
    const key = scopeKey("PROJETO", p.id);
    const inherited = accessByKey.get(scopeKey("CONTEXTO", p.contextoId));
    const level = explicit.has(key)
      ? explicit.get(key)!
      : (inherited ?? "none");
    accessByKey.set(key, level);
    if (canRead(level)) projetoIds.add(p.id);
  }

  const oficinaIds = new Set<string>();
  for (const o of oficinas) {
    const key = scopeKey("OFICINA", o.id);
    const inherited = accessByKey.get(scopeKey("PROJETO", o.projetoId));
    const level = explicit.has(key)
      ? explicit.get(key)!
      : (inherited ?? "none");
    accessByKey.set(key, level);
    if (canRead(level)) oficinaIds.add(o.id);
  }

  return {
    mode: "LIMITED",
    contextoIds: [...contextoIds],
    projetoIds: [...projetoIds],
    oficinaIds: [...oficinaIds],
    accessByKey,
  };
}

/**
 * Resolve escopo com herança: contexto → projeto → oficina.
 * Usuário LIMITED sem escopos próprios herda o escopo padrão do papel.
 * Memoizado por request.
 */
export const resolveDataScope = cache(
  async (userId: string): Promise<DataScopeResolved> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        dataScopeMode: true,
        isSuperAdmin: true,
        dataScopes: true,
        role: {
          select: {
            dataScopeMode: true,
            dataScopes: true,
            name: true,
          },
        },
      },
    });

    if (!user || user.isSuperAdmin || user.dataScopeMode === "ALL") {
      return { ...ALL_SCOPE, accessByKey: new Map() };
    }

    if (user.dataScopes.length > 0) {
      return resolveLimitedFromEntries(user.dataScopes);
    }

    if (user.role.dataScopeMode === "ALL") {
      return { ...ALL_SCOPE, accessByKey: new Map() };
    }
    return resolveLimitedFromEntries(user.role.dataScopes);
  },
);

/** Contextos visíveis no escopo limitado (direto ou via projetos/oficinas). */
export function contextoWhereFromScope(
  scope: DataScopeResolved,
): Prisma.ContextoWhereInput {
  if (scope.mode === "ALL") return {};
  const contextoIds = scope.contextoIds ?? [];
  const projetoIds = scope.projetoIds ?? [];
  const oficinaIds = scope.oficinaIds ?? [];
  if (!contextoIds.length && !projetoIds.length && !oficinaIds.length) {
    return { id: "__none__" };
  }
  const or: Prisma.ContextoWhereInput[] = [];
  if (contextoIds.length) or.push({ id: { in: contextoIds } });
  if (projetoIds.length) {
    or.push({ projetos: { some: { id: { in: projetoIds } } } });
  }
  if (oficinaIds.length) {
    or.push({
      projetos: {
        some: { oficinas: { some: { id: { in: oficinaIds } } } },
      },
    });
  }
  return { OR: or };
}

/** Projetos visíveis no escopo limitado. */
export function projetoWhereFromScope(
  scope: DataScopeResolved,
): Prisma.ProjetoWhereInput {
  if (scope.mode === "ALL") return {};
  const contextoIds = scope.contextoIds ?? [];
  const projetoIds = scope.projetoIds ?? [];
  const oficinaIds = scope.oficinaIds ?? [];
  if (!contextoIds.length && !projetoIds.length && !oficinaIds.length) {
    return { id: "__none__" };
  }
  const or: Prisma.ProjetoWhereInput[] = [];
  if (projetoIds.length) or.push({ id: { in: projetoIds } });
  if (contextoIds.length) or.push({ contextoId: { in: contextoIds } });
  if (oficinaIds.length) {
    or.push({ oficinas: { some: { id: { in: oficinaIds } } } });
  }
  return { OR: or };
}

/** Oficinas visíveis no escopo limitado. */
export function oficinaWhereFromScope(
  scope: DataScopeResolved,
): Prisma.OficinaWhereInput {
  if (scope.mode === "ALL") return {};
  const contextoIds = scope.contextoIds ?? [];
  const projetoIds = scope.projetoIds ?? [];
  const oficinaIds = scope.oficinaIds ?? [];
  if (!contextoIds.length && !projetoIds.length && !oficinaIds.length) {
    return { id: "__none__" };
  }
  const or: Prisma.OficinaWhereInput[] = [];
  if (oficinaIds.length) or.push({ id: { in: oficinaIds } });
  if (projetoIds.length) or.push({ projetoId: { in: projetoIds } });
  if (contextoIds.length) {
    or.push({ projeto: { contextoId: { in: contextoIds } } });
  }
  return { OR: or };
}

/** Cláusula Prisma para filtrar Inscricao pelo escopo do usuário (leitura). */
export function inscricaoWhereFromScope(
  scope: DataScopeResolved,
): Prisma.InscricaoWhereInput {
  if (scope.mode === "ALL") return {};
  const oficinaIds = scope.oficinaIds ?? [];
  const projetoIds = scope.projetoIds ?? [];
  const contextoIds = scope.contextoIds ?? [];
  if (
    oficinaIds.length === 0 &&
    projetoIds.length === 0 &&
    contextoIds.length === 0
  ) {
    return { id: "__none__" };
  }
  const or: Prisma.InscricaoWhereInput[] = [];
  if (oficinaIds.length) or.push({ idOficina: { in: oficinaIds } });
  if (projetoIds.length) or.push({ idProjeto: { in: projetoIds } });
  if (contextoIds.length) or.push({ contextoId: { in: contextoIds } });
  return { OR: or };
}

function effectiveLevelForTarget(
  scope: DataScopeResolved,
  target: {
    contextoId?: string | null;
    idProjeto?: string | null;
    idOficina?: string | null;
  },
): ScopeAccessLevel {
  if (scope.mode === "ALL") return "editor";
  if (target.idOficina) {
    return (
      scope.accessByKey.get(scopeKey("OFICINA", target.idOficina)) ?? "none"
    );
  }
  if (target.idProjeto) {
    return (
      scope.accessByKey.get(scopeKey("PROJETO", target.idProjeto)) ?? "none"
    );
  }
  if (target.contextoId) {
    return (
      scope.accessByKey.get(scopeKey("CONTEXTO", target.contextoId)) ?? "none"
    );
  }
  return "none";
}

/** Combina filtro de escopo com um where existente. */
export function andScope(
  scope: DataScopeResolved,
  where: Prisma.InscricaoWhereInput = {},
): Prisma.InscricaoWhereInput {
  const scopeWhere = inscricaoWhereFromScope(scope);
  const emptyScope =
    Object.keys(scopeWhere).length === 0 || scope.mode === "ALL";
  if (emptyScope) return where;
  if (Object.keys(where).length === 0) return scopeWhere;
  return { AND: [where, scopeWhere] };
}

export async function assertDataAccess(
  userId: string,
  target: {
    contextoId?: string | null;
    idProjeto?: string | null;
    idOficina?: string | null;
  },
  opts?: { write?: boolean },
): Promise<boolean> {
  const scope = await resolveDataScope(userId);
  return hasScopeAccess(scope, target, opts);
}

/** Checagem síncrona sobre um escopo já resolvido. */
export function hasScopeAccess(
  scope: DataScopeResolved,
  target: {
    contextoId?: string | null;
    idProjeto?: string | null;
    idOficina?: string | null;
  },
  opts?: { write?: boolean },
): boolean {
  if (scope.mode === "ALL") return true;
  const level = effectiveLevelForTarget(scope, target);
  return opts?.write ? canWrite(level) : canRead(level);
}
