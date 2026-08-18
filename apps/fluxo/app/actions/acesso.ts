"use server";

import { revalidatePath } from "next/cache";
import type { PermissionEffect, Prisma } from "@prisma/client";
import { requireAuth, requirePermission, bumpSessionVersion } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { ADMIN_ROLE_NAME, type PermissionCode } from "@/lib/permission-catalog";
import { writeAuditLog } from "@/lib/audit";
import { createUserWithProvisionalPassword } from "@/app/actions/auth";
import {
  compactScopeEntries,
  type DataScopeKind,
  type ScopeAccessLevel,
} from "@/lib/data-scope-shared";
import { resolveDataScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";

export type AccessActionResult =
  | {
      ok: true;
      message?: string;
      provisionalPassword?: string;
      userId?: string;
      roleId?: string;
    }
  | { ok: false; error: string };

type ScopeInput = {
  kind: DataScopeKind;
  resourceId: string;
  access: ScopeAccessLevel;
};

async function requireAnyPermission(codes: PermissionCode[]) {
  const user = await requireAuth();
  const perms = await getEffectivePermissions(user.id);
  if (!codes.some((c) => perms.has(c))) {
    throw new Error("Sem permissão");
  }
  return user;
}

/** Papel Administrador sempre tem escopo total (sem matriz). */
async function normalizeAccessForRole(
  roleId: string,
  dataScopeMode: "ALL" | "LIMITED",
  scopes: ScopeInput[],
): Promise<
  | { ok: true; dataScopeMode: "ALL" | "LIMITED"; scopes: ScopeInput[] }
  | { ok: false; error: string }
> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return { ok: false, error: "Papel não encontrado." };
  if (role.name === ADMIN_ROLE_NAME) {
    return { ok: true, dataScopeMode: "ALL", scopes: [] };
  }
  return { ok: true, dataScopeMode, scopes };
}

async function assertCanManageUser(
  actorId: string,
  target: { id: string; isSuperAdmin: boolean },
): Promise<AccessActionResult | null> {
  if (!target.isSuperAdmin) return null;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { isSuperAdmin: true },
  });
  if (!actor?.isSuperAdmin) {
    return {
      ok: false,
      error: "Conta superadmin só pode ser gerenciada por outro superadmin.",
    };
  }
  return null;
}

/** Hierarquia mínima para compactar escopos — sem catálogo global. */
async function loadHierarchyForCompact(scopes: ScopeInput[]) {
  const seedCtxIds = scopes
    .filter((s) => s.kind === "CONTEXTO")
    .map((s) => s.resourceId);
  const seedProjIds = scopes
    .filter((s) => s.kind === "PROJETO")
    .map((s) => s.resourceId);
  const seedOfIds = scopes
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

  const projetoIds = projetos.map((p) => p.id);
  const oficinaOr: Prisma.OficinaWhereInput[] = [];
  if (projetoIds.length) oficinaOr.push({ projetoId: { in: projetoIds } });
  if (seedOfIds.length) oficinaOr.push({ id: { in: seedOfIds } });

  const oficinas =
    oficinaOr.length > 0
      ? await prisma.oficina.findMany({
          where: { OR: oficinaOr },
          select: { id: true, projetoId: true },
        })
      : [];

  return { projetos, oficinas };
}

async function persistScopes(
  userId: string,
  dataScopeMode: "ALL" | "LIMITED",
  scopes: ScopeInput[],
) {
  await prisma.userDataScope.deleteMany({ where: { userId } });
  if (dataScopeMode !== "LIMITED" || scopes.length === 0) return;

  const { projetos, oficinas } = await loadHierarchyForCompact(scopes);
  const compacted = compactScopeEntries({
    entries: scopes,
    projetos,
    oficinas,
  });

  if (compacted.length === 0) return;

  await prisma.userDataScope.createMany({
    data: compacted.map((s) => ({
      userId,
      kind: s.kind,
      resourceId: s.resourceId,
      access: s.access,
    })),
    skipDuplicates: true,
  });
}

async function persistRoleScopes(
  roleId: string,
  dataScopeMode: "ALL" | "LIMITED",
  scopes: ScopeInput[],
) {
  await prisma.roleDataScope.deleteMany({ where: { roleId } });
  if (dataScopeMode !== "LIMITED" || scopes.length === 0) return;

  const { projetos, oficinas } = await loadHierarchyForCompact(scopes);
  const compacted = compactScopeEntries({
    entries: scopes,
    projetos,
    oficinas,
  });

  if (compacted.length === 0) return;

  await prisma.roleDataScope.createMany({
    data: compacted.map((s) => ({
      roleId,
      kind: s.kind,
      resourceId: s.resourceId,
      access: s.access,
    })),
    skipDuplicates: true,
  });
}

export async function listAccessBootstrapAction() {
  const actor = await requireAnyPermission(["usuarios:read", "roles:read"]);
  const scope = await resolveDataScope(actor.id);

  const emptyLimited =
    scope.mode !== "ALL" &&
    !(
      (scope.projetoIds?.length ?? 0) ||
      (scope.oficinaIds?.length ?? 0) ||
      (scope.contextoIds?.length ?? 0)
    );

  const [users, roles, permissions, actorRow] = await Promise.all([
    prisma.user.findMany({
      include: {
        role: true,
        permissions: { include: { permission: true } },
        dataScopes: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        dataScopes: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.permission.findMany({
      orderBy: [{ group: "asc" }, { code: "asc" }],
    }),
    prisma.user.findUnique({
      where: { id: actor.id },
      select: { isSuperAdmin: true },
    }),
  ]);

  let contextos: Array<{ id: string; nome: string }> = [];
  let projetos: Array<{ id: string; nome: string; contextoId: string }> = [];
  let oficinas: Array<{ id: string; nome: string; projetoId: string }> = [];

  if (!emptyLimited) {
    if (scope.mode === "ALL") {
      [contextos, projetos, oficinas] = await Promise.all([
        prisma.contexto.findMany({
          orderBy: { nome: "asc" },
          select: { id: true, nome: true },
        }),
        prisma.projeto.findMany({
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, contextoId: true },
        }),
        prisma.oficina.findMany({
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, projetoId: true },
        }),
      ]);
    } else {
      oficinas = (scope.oficinaIds?.length ?? 0)
        ? await prisma.oficina.findMany({
            where: { id: { in: scope.oficinaIds! } },
            orderBy: { nome: "asc" },
            select: { id: true, nome: true, projetoId: true },
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
            orderBy: { nome: "asc" },
            select: { id: true, nome: true, contextoId: true },
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
            orderBy: { nome: "asc" },
            select: { id: true, nome: true },
          })
        : [];
    }
  }

  return {
    actorIsSuperAdmin: Boolean(actorRow?.isSuperAdmin),
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      roleId: u.roleId,
      roleName: u.isSuperAdmin ? "Superadmin" : u.role.name,
      isSuperAdmin: u.isSuperAdmin,
      dataScopeMode: u.isSuperAdmin ? "ALL" : u.dataScopeMode,
      mustChangePassword: u.mustChangePassword,
      totpEnabled: u.totpEnabled,
      deactivatedAt: u.deactivatedAt?.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      overrides: u.permissions.map((p) => ({
        permissionId: p.permissionId,
        code: p.permission.code,
        effect: p.effect,
      })),
      scopes: u.dataScopes.map((s) => ({
        kind: s.kind,
        resourceId: s.resourceId,
        access: s.access,
      })),
    })),
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      dataScopeMode:
        r.name === ADMIN_ROLE_NAME ? ("ALL" as const) : r.dataScopeMode,
      usersCount: r._count.users,
      permissionIds: r.permissions.map((p) => p.permissionId),
      scopes: r.dataScopes.map((s) => ({
        kind: s.kind,
        resourceId: s.resourceId,
        access: s.access,
      })),
    })),
    permissions: permissions.map((p) => ({
      id: p.id,
      code: p.code,
      label: p.label,
      group: p.group,
    })),
    contextos,
    projetos,
    oficinas,
  };
}

export async function createUserAction(input: {
  email: string;
  name: string;
  roleId: string;
  dataScopeMode: "ALL" | "LIMITED";
  scopes: ScopeInput[];
  overrides: Array<{ permissionId: string; effect: PermissionEffect }>;
}): Promise<AccessActionResult> {
  const actor = await requirePermission("usuarios:write");
  const email = input.email.trim().toLowerCase();
  if (!email || !input.name.trim()) {
    return { ok: false, error: "Nome e e-mail são obrigatórios." };
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { ok: false, error: "E-mail já cadastrado." };

  const normalized = await normalizeAccessForRole(
    input.roleId,
    input.dataScopeMode,
    input.scopes,
  );
  if (!normalized.ok) return normalized;

  const { user, provisional } = await createUserWithProvisionalPassword({
    email,
    name: input.name,
    roleId: input.roleId,
    dataScopeMode: normalized.dataScopeMode,
    createdById: actor.id,
  });

  await persistScopes(user.id, normalized.dataScopeMode, normalized.scopes);

  if (input.overrides.length) {
    await prisma.userPermission.createMany({
      data: input.overrides.map((o) => ({
        userId: user.id,
        permissionId: o.permissionId,
        effect: o.effect,
      })),
      skipDuplicates: true,
    });
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.created",
    entityType: "User",
    entityId: user.id,
    meta: { email },
  });
  revalidatePath("/dashboard/acesso/usuarios");
  return {
    ok: true,
    message: "Usuário criado.",
    provisionalPassword: provisional,
    userId: user.id,
  };
}

export async function updateUserAction(input: {
  id: string;
  name: string;
  roleId: string;
  dataScopeMode: "ALL" | "LIMITED";
  scopes: ScopeInput[];
  overrides: Array<{ permissionId: string; effect: PermissionEffect }>;
}): Promise<AccessActionResult> {
  const actor = await requirePermission("usuarios:write");
  const existing = await prisma.user.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, error: "Usuário não encontrado." };

  const blocked = await assertCanManageUser(actor.id, existing);
  if (blocked) return blocked;

  if (existing.isSuperAdmin) {
    // Superadmin não usa papel/escopo do sistema — só nome.
    await prisma.user.update({
      where: { id: input.id },
      data: {
        name: input.name.trim(),
        dataScopeMode: "ALL",
      },
    });
    await persistScopes(input.id, "ALL", []);
    await prisma.userPermission.deleteMany({ where: { userId: input.id } });
    await bumpSessionVersion(input.id);
    await writeAuditLog({
      actorUserId: actor.id,
      action: "user.updated",
      entityType: "User",
      entityId: input.id,
      meta: { superadmin: true },
    });
    revalidatePath("/dashboard/acesso/usuarios");
    return { ok: true, message: "Usuário atualizado." };
  }

  const normalized = await normalizeAccessForRole(
    input.roleId,
    input.dataScopeMode,
    input.scopes,
  );
  if (!normalized.ok) return normalized;

  await prisma.user.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      roleId: input.roleId,
      dataScopeMode: normalized.dataScopeMode,
    },
  });

  await persistScopes(input.id, normalized.dataScopeMode, normalized.scopes);

  await prisma.userPermission.deleteMany({ where: { userId: input.id } });
  if (input.overrides.length) {
    await prisma.userPermission.createMany({
      data: input.overrides.map((o) => ({
        userId: input.id,
        permissionId: o.permissionId,
        effect: o.effect,
      })),
    });
  }

  await bumpSessionVersion(input.id);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.updated",
    entityType: "User",
    entityId: input.id,
  });
  revalidatePath("/dashboard/acesso/usuarios");
  return { ok: true, message: "Usuário atualizado." };
}

export async function deactivateUserAction(
  id: string,
): Promise<AccessActionResult> {
  const actor = await requirePermission("usuarios:write");
  if (actor.id === id) {
    return { ok: false, error: "Você não pode desativar a si mesmo." };
  }
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "Usuário não encontrado." };
  if (target.isSuperAdmin) {
    return { ok: false, error: "Não é possível desativar o superadmin." };
  }
  await prisma.user.update({
    where: { id },
    data: {
      deactivatedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.deactivated",
    entityType: "User",
    entityId: id,
  });
  revalidatePath("/dashboard/acesso/usuarios");
  return { ok: true, message: "Usuário desativado." };
}

export async function reactivateUserAction(
  id: string,
): Promise<AccessActionResult> {
  const actor = await requirePermission("usuarios:write");
  await prisma.user.update({
    where: { id },
    data: { deactivatedAt: null },
  });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.reactivated",
    entityType: "User",
    entityId: id,
  });
  revalidatePath("/dashboard/acesso/usuarios");
  return { ok: true, message: "Usuário reativado." };
}

export async function deleteUserAction(id: string): Promise<AccessActionResult> {
  const actor = await requirePermission("usuarios:write");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { ok: false, error: "Usuário não encontrado." };
  if (user.isSuperAdmin) {
    return { ok: false, error: "Não é possível excluir o superadmin." };
  }
  if (user.lastLoginAt) {
    return {
      ok: false,
      error: "Usuário já acessou o sistema. Desative em vez de excluir.",
    };
  }
  if (actor.id === id) {
    return { ok: false, error: "Você não pode excluir a si mesmo." };
  }
  await prisma.user.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.deleted",
    entityType: "User",
    entityId: id,
    meta: { email: user.email },
  });
  revalidatePath("/dashboard/acesso/usuarios");
  return { ok: true, message: "Usuário excluído." };
}

export async function createRoleAction(input: {
  name: string;
  description: string;
  permissionIds: string[];
  dataScopeMode: "ALL" | "LIMITED";
  scopes: ScopeInput[];
}): Promise<AccessActionResult> {
  const actor = await requirePermission("roles:write");
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Informe o nome do papel." };
  if (name === ADMIN_ROLE_NAME) {
    return { ok: false, error: "Nome reservado ao papel do sistema." };
  }
  const exists = await prisma.role.findUnique({ where: { name } });
  if (exists) return { ok: false, error: "Já existe um papel com este nome." };

  const dataScopeMode = input.dataScopeMode === "ALL" ? "ALL" : "LIMITED";
  const scopes = dataScopeMode === "ALL" ? [] : input.scopes;

  const role = await prisma.role.create({
    data: {
      name,
      description: input.description.trim(),
      isSystem: false,
      dataScopeMode,
      permissions: {
        create: input.permissionIds.map((permissionId) => ({ permissionId })),
      },
    },
  });
  await persistRoleScopes(role.id, dataScopeMode, scopes);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "role.created",
    entityType: "Role",
    entityId: role.id,
    meta: { dataScopeMode },
  });
  revalidatePath("/dashboard/acesso/papeis");
  return { ok: true, message: "Papel criado.", roleId: role.id };
}

export async function updateRoleAction(input: {
  id: string;
  name: string;
  description: string;
  permissionIds: string[];
  dataScopeMode: "ALL" | "LIMITED";
  scopes: ScopeInput[];
}): Promise<AccessActionResult> {
  const actor = await requirePermission("roles:write");
  const role = await prisma.role.findUnique({ where: { id: input.id } });
  if (!role) return { ok: false, error: "Papel não encontrado." };

  const isAdmin = role.name === ADMIN_ROLE_NAME;
  const dataScopeMode = isAdmin
    ? "ALL"
    : input.dataScopeMode === "ALL"
      ? "ALL"
      : "LIMITED";
  const scopes = dataScopeMode === "ALL" ? [] : input.scopes;

  await prisma.role.update({
    where: { id: input.id },
    data: {
      name: role.isSystem ? role.name : input.name.trim(),
      description: input.description.trim(),
      dataScopeMode,
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: input.id } });
  if (input.permissionIds.length) {
    await prisma.rolePermission.createMany({
      data: input.permissionIds.map((permissionId) => ({
        roleId: input.id,
        permissionId,
      })),
    });
  }
  await persistRoleScopes(input.id, dataScopeMode, scopes);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "role.updated",
    entityType: "Role",
    entityId: input.id,
    meta: { dataScopeMode },
  });
  revalidatePath("/dashboard/acesso/papeis");
  return { ok: true, message: "Papel atualizado." };
}

export async function deleteRoleAction(id: string): Promise<AccessActionResult> {
  const actor = await requirePermission("roles:write");
  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return { ok: false, error: "Papel não encontrado." };
  if (role.isSystem) {
    return { ok: false, error: "Papéis do sistema não podem ser excluídos." };
  }
  if (role._count.users > 0) {
    return { ok: false, error: "Remova os usuários deste papel antes." };
  }
  await prisma.role.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: actor.id,
    action: "role.deleted",
    entityType: "Role",
    entityId: id,
  });
  revalidatePath("/dashboard/acesso/papeis");
  return { ok: true, message: "Papel excluído." };
}

export type AuditLogFilters = {
  q?: string;
  actionPrefix?: string;
  action?: string;
  entityType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  take?: number;
};

export type AuditLogDTO = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: unknown;
  ip: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
};

function buildAuditWhere(input: AuditLogFilters = {}) {
  const q = input.q?.trim();
  const actionPrefix = input.actionPrefix?.trim();
  const action = input.action?.trim();
  const entityType = input.entityType?.trim();
  const actorId = input.actorId?.trim();
  const from = input.from?.trim();
  const to = input.to?.trim();

  const and: Prisma.AuditLogWhereInput[] = [];

  if (q) {
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { ip: { contains: q, mode: "insensitive" } },
        { actor: { name: { contains: q, mode: "insensitive" } } },
        { actor: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (action) and.push({ action });
  else if (actionPrefix) and.push({ action: { startsWith: actionPrefix } });
  if (entityType && entityType !== "all") and.push({ entityType });
  if (actorId && actorId !== "all") and.push({ actorUserId: actorId });
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) and.push({ createdAt: { gte: d } });
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      // incluir o dia inteiro quando vier só a data
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setHours(23, 59, 59, 999);
      and.push({ createdAt: { lte: d } });
    }
  }

  return and.length ? { AND: and } : undefined;
}

function mapAuditRow(r: {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: unknown;
  ip: string | null;
  createdAt: Date;
  actorUserId: string | null;
  actor: { name: string; email: string } | null;
}): AuditLogDTO {
  return {
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    meta: r.meta,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
    actorId: r.actorUserId,
    actorName: r.actor?.name ?? "—",
    actorEmail: r.actor?.email ?? "",
  };
}

export async function listAuditLogsAction(
  input?: AuditLogFilters,
): Promise<{ logs: AuditLogDTO[]; total: number }> {
  await requirePermission("audit:read");
  const take = Math.min(Math.max(input?.take ?? 200, 1), 500);
  const where = buildAuditWhere(input);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs: rows.map(mapAuditRow), total };
}

export async function listAuditFilterOptionsAction(): Promise<{
  actions: string[];
  entityTypes: string[];
  actors: Array<{ id: string; name: string; email: string }>;
}> {
  await requirePermission("audit:read");
  const [actions, entityTypes, actors] = await Promise.all([
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
      take: 200,
    }),
    prisma.auditLog.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return {
    actions: actions.map((a) => a.action),
    entityTypes: entityTypes.map((e) => e.entityType).filter(Boolean),
    actors,
  };
}

export async function exportAuditLogsAction(
  input?: AuditLogFilters,
): Promise<
  | { ok: true; logs: AuditLogDTO[]; total: number; exportedAt: string }
  | { ok: false; error: string }
> {
  const actor = await requirePermission("audit:read");
  const take = Math.min(Math.max(input?.take ?? 2000, 1), 5000);
  const where = buildAuditWhere(input);
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  await writeAuditLog({
    actorUserId: actor.id,
    action: "audit.exported",
    entityType: "AuditLog",
    meta: {
      exported: rows.length,
      totalMatched: total,
      filters: {
        q: input?.q ?? null,
        actionPrefix: input?.actionPrefix ?? null,
        action: input?.action ?? null,
        entityType: input?.entityType ?? null,
        actorId: input?.actorId ?? null,
        from: input?.from ?? null,
        to: input?.to ?? null,
      },
    },
  });

  return {
    ok: true,
    logs: rows.map(mapAuditRow),
    total,
    exportedAt: new Date().toISOString(),
  };
}
