import { requireAuth } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";

/** Mostra os atalhos para o acompanhamento só a quem pode abri-lo. */
export async function podeVerAcompanhamento(): Promise<boolean> {
  try {
    const user = await requireAuth();
    return await userHasPermission(user.id, "acompanhamento:read");
  } catch {
    return false;
  }
}
