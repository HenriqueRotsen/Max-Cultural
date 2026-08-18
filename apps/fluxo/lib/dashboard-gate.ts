import { cache } from "react";
import { redirect } from "next/navigation";
import {
  getSessionUser,
  needs2faSetup,
  needsPasswordChange,
  type SessionUser,
} from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import type { PermissionCode } from "@/lib/permission-catalog";

/** Garante sessão completa (sem onboarding pendente). Memoizado por request. */
export const requireDashboardUser = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) redirect("/dashboard/login");
  if (needsPasswordChange(user)) redirect("/dashboard/onboarding/senha");
  if (needs2faSetup(user)) redirect("/dashboard/onboarding/2fa");
  return user;
});

export async function requireDashboardPermission(
  code: PermissionCode,
): Promise<SessionUser> {
  const user = await requireDashboardUser();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("dashboard:access") && code !== "perfil:write") {
    redirect("/dashboard/login");
  }
  if (!perms.has(code)) {
    redirect("/dashboard");
  }
  return user;
}
