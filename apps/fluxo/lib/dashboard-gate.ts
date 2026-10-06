import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { redirectToHubDenied, redirectToHubLogin } from "@/lib/hub";
import { getEffectivePermissions } from "@/lib/permissions";
import type { PermissionCode } from "@/lib/permission-catalog";

/** Garante sessão do hub MAX Cultural. Memoizado por request. */
export const requireDashboardUser = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) redirectToHubLogin("/dashboard");
  return user;
});

export async function requireDashboardPermission(
  code: PermissionCode,
): Promise<SessionUser> {
  const user = await requireDashboardUser();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("dashboard:access")) {
    redirectToHubDenied("Sem acesso ao MAX Fluxo.");
  }
  if (!perms.has(code)) {
    redirect("/dashboard");
  }
  return user;
}
