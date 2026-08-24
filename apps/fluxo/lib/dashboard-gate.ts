import { cache } from "react";
import { redirect } from "next/navigation";
import {
  getSessionUser,
  needs2faSetup,
  needsPasswordChange,
  type SessionUser,
} from "@/lib/auth";
import { redirectToHubLogin } from "@/lib/hub";
import { getEffectivePermissions } from "@/lib/permissions";
import type { PermissionCode } from "@/lib/permission-catalog";

/** Garante sessão do hub MAX Cultural. Memoizado por request. */
export const requireDashboardUser = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) redirectToHubLogin("/dashboard");
  if (needsPasswordChange(user)) redirect("/dashboard/onboarding/senha");
  if (needs2faSetup(user)) redirect("/dashboard/onboarding/2fa");
  return user;
});

export async function requireDashboardPermission(
  code: PermissionCode,
): Promise<SessionUser> {
  const user = await requireDashboardUser();
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("dashboard:access")) {
    redirectToHubLogin("/dashboard");
  }
  if (!perms.has(code)) {
    redirect("/dashboard");
  }
  return user;
}
