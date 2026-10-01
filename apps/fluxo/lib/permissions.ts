import { cache } from "react";
import type { PermissionEffect, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type PermissionCode,
  PERMISSION_CODES,
} from "@/lib/permission-catalog";
import { getHubFluxoAccess } from "@/lib/hub-permissions";

export type AuthUser = User & {
  role: { id: string; name: string };
};

/** Memoizado por request — AdminShell + page + action compartilham o mesmo Set. */
export const getEffectivePermissions = cache(
  async (userId: string): Promise<Set<PermissionCode>> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        permissions: { include: { permission: true } },
      },
    });
    if (!user || user.deactivatedAt) return new Set();

    let set = new Set<PermissionCode>();
    if (user.isSuperAdmin) {
      set = new Set(PERMISSION_CODES);
    } else {
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
    }

    // Perfil próprio sempre disponível
    set.add("perfil:write");

    // Com sessão do hub: interseção com capabilities do Cultural.
    const hub = await getHubFluxoAccess();
    if (hub.hasHubSession) {
      if (!hub.allowedProduct) return new Set();
      for (const code of [...set]) {
        if (code === "perfil:write") continue;
        if (!hub.codes.has(code)) set.delete(code);
      }
    }

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
