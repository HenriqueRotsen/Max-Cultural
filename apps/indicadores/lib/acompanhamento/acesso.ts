import { requireAuth } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";
import type { PermissionCode } from "@/lib/permission-catalog";

async function pode(code: PermissionCode): Promise<boolean> {
  try {
    const user = await requireAuth();
    return await userHasPermission(user.id, code);
  } catch {
    return false;
  }
}

/** Mostra os atalhos para o acompanhamento só a quem pode abri-lo. */
export async function podeVerAcompanhamento(): Promise<boolean> {
  return pode("acompanhamento:read");
}

/** Mostra os atalhos para a prestação de contas só a quem pode abri-la. */
export async function podeVerPrestacao(): Promise<boolean> {
  return pode("prestacao:read");
}
