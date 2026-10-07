import { cache } from "react";
import type { PermissionEffect, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type PermissionCode,
  PERMISSION_CODES,
  PROFESSOR_ROLE_NAME,
} from "@/lib/permission-catalog";
import { getHubFluxoAccess } from "@/lib/hub-permissions";

export type AuthUser = User & {
  role: { id: string; name: string };
};

const FORMULARIOS_CODES: PermissionCode[] = [
  "formularios:review",
  "formularios:write",
  "formularios:merge",
  "dashboard:access",
];

function applyLocalRole(
  set: Set<PermissionCode>,
  user: {
    isSuperAdmin: boolean;
    role: {
      name: string;
      permissions: Array<{ permission: { code: string } }>;
    };
    permissions: Array<{ effect: PermissionEffect; permission: { code: string } }>;
  },
) {
  if (user.isSuperAdmin) {
    for (const code of PERMISSION_CODES) set.add(code);
    return;
  }

  for (const rp of user.role.permissions) {
    const code = rp.permission.code as PermissionCode;
    if (PERMISSION_CODES.includes(code)) set.add(code);
  }
  for (const up of user.permissions) {
    const code = up.permission.code as PermissionCode;
    if (!PERMISSION_CODES.includes(code)) continue;
    if (up.effect === ("GRANT" as PermissionEffect)) set.add(code);
    if (up.effect === ("DENY" as PermissionEffect)) set.delete(code);
  }

  // Papel Professor no satélite: garante review mesmo com cookie SSO antigo.
  if (user.role.name === PROFESSOR_ROLE_NAME) {
    set.add("dashboard:access");
    set.add("formularios:review");
  }
}

/** Memoizado por request — AdminShell + page + action compartilham o mesmo Set. */
export const getEffectivePermissions = cache(
  async (userId: string): Promise<Set<PermissionCode>> => {
    const hub = await getHubFluxoAccess();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        permissions: { include: { permission: true } },
      },
    });

    if (hub.hasHubSession && !hub.fetchFailed) {
      if (!hub.allowedProduct) return new Set();
      const set = new Set<PermissionCode>(hub.codes);
      // Une grants locais de formulários (cookie SSO pode estar desatualizado
      // após criar o papel Professor / fluxo.formularios).
      if (user && !user.deactivatedAt) {
        const local = new Set<PermissionCode>();
        applyLocalRole(local, user);
        for (const code of FORMULARIOS_CODES) {
          if (local.has(code)) set.add(code);
        }
      }
      set.add("perfil:write");
      return set;
    }

    if (!user || user.deactivatedAt) return new Set();

    const set = new Set<PermissionCode>();
    applyLocalRole(set, user);
    set.add("perfil:write");
    return set;
  },
);

export async function userHasPermission(
  userId: string,
  code: PermissionCode,
): Promise<boolean> {
  const perms = await getEffectivePermissions(userId);
  return perms.has(code);
}
