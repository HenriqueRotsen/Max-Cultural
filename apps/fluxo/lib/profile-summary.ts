import { prisma } from "@/lib/prisma";
import { resolveDataScope } from "@/lib/data-scope";
import { getEffectivePermissions } from "@/lib/permissions";
import {
  PERMISSION_CATALOG,
  type PermissionCode,
} from "@/lib/permission-catalog";

export type ProfileScopeItem = {
  kind: "CONTEXTO" | "PROJETO" | "OFICINA";
  id: string;
  label: string;
  access: "viewer" | "editor";
  parentLabel?: string;
};

export type ProfileSummary = {
  roleName: string;
  isSuperAdmin: boolean;
  dataScopeMode: "ALL" | "LIMITED";
  scopeSource: "user" | "role" | "all";
  scopeItems: ProfileScopeItem[];
  permissionsByGroup: Array<{ group: string; labels: string[] }>;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  totpEnabled: boolean;
};

export async function getOwnProfileSummary(
  userId: string,
): Promise<ProfileSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      dataScopeMode: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      totpEnabled: true,
      dataScopes: { select: { id: true } },
      role: {
        select: {
          name: true,
          dataScopeMode: true,
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!user) {
    throw new Error("Usuário não encontrado");
  }

  const [perms, scope, contextos, projetos, oficinas] = await Promise.all([
    getEffectivePermissions(userId),
    resolveDataScope(userId),
    prisma.contexto.findMany({ select: { id: true, nome: true } }),
    prisma.projeto.findMany({
      select: { id: true, nome: true, contextoId: true },
    }),
    prisma.oficina.findMany({
      select: { id: true, nome: true, projetoId: true },
    }),
  ]);

  const ctxName = new Map(contextos.map((c) => [c.id, c.nome || "(sem nome)"]));
  const projName = new Map(projetos.map((p) => [p.id, p.nome]));

  const scopeItems: ProfileScopeItem[] = [];
  if (scope.mode !== "ALL") {
    for (const c of contextos) {
      const level = scope.accessByKey.get(`CONTEXTO:${c.id}`);
      if (level === "viewer" || level === "editor") {
        scopeItems.push({
          kind: "CONTEXTO",
          id: c.id,
          label: c.nome || "(sem nome)",
          access: level,
        });
      }
    }
    for (const p of projetos) {
      const level = scope.accessByKey.get(`PROJETO:${p.id}`);
      if (level !== "viewer" && level !== "editor") continue;
      const parentLevel = scope.accessByKey.get(`CONTEXTO:${p.contextoId}`);
      if (parentLevel === level) continue;
      scopeItems.push({
        kind: "PROJETO",
        id: p.id,
        label: p.nome,
        access: level,
        parentLabel: ctxName.get(p.contextoId),
      });
    }
    for (const o of oficinas) {
      const level = scope.accessByKey.get(`OFICINA:${o.id}`);
      if (level !== "viewer" && level !== "editor") continue;
      const parentLevel = scope.accessByKey.get(`PROJETO:${o.projetoId}`);
      if (parentLevel === level) continue;
      scopeItems.push({
        kind: "OFICINA",
        id: o.id,
        label: o.nome,
        access: level,
        parentLabel: projName.get(o.projetoId),
      });
    }
  }

  const byGroup = new Map<string, string[]>();
  for (const p of PERMISSION_CATALOG) {
    if (!perms.has(p.code as PermissionCode)) continue;
    if (p.code === "perfil:write") continue; // sempre presente, pouco útil na lista
    const list = byGroup.get(p.group) ?? [];
    list.push(p.label);
    byGroup.set(p.group, list);
  }

  let scopeSource: ProfileSummary["scopeSource"] = "all";
  if (!user.isSuperAdmin && user.dataScopeMode !== "ALL" && scope.mode !== "ALL") {
    scopeSource = user.dataScopes.length > 0 ? "user" : "role";
  } else if (
    !user.isSuperAdmin &&
    user.dataScopeMode === "LIMITED" &&
    user.dataScopes.length === 0 &&
    user.role.dataScopeMode === "ALL"
  ) {
    scopeSource = "role";
  }

  return {
    roleName: user.isSuperAdmin ? "Superadmin" : user.role.name,
    isSuperAdmin: user.isSuperAdmin,
    dataScopeMode: scope.mode,
    scopeSource,
    scopeItems,
    permissionsByGroup: [...byGroup.entries()].map(([group, labels]) => ({
      group,
      labels,
    })),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    createdByName: user.createdBy?.name ?? null,
    totpEnabled: user.totpEnabled,
  };
}
