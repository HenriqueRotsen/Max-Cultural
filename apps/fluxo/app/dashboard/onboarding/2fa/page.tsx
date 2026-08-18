import { redirect } from "next/navigation";
import { SiteShell } from "@/components/app-header";
import { Onboarding2faForm } from "@/components/admin/onboarding-2fa-form";
import {
  getSessionUser,
  needs2faSetup,
  needsPasswordChange,
} from "@/lib/auth";
import { is2faDisabled } from "@/lib/totp";

export default async function Onboarding2faPage() {
  const user = await getSessionUser();
  if (!user) redirect("/dashboard/login");
  if (needsPasswordChange(user)) redirect("/dashboard/onboarding/senha");
  if (is2faDisabled() || !needs2faSetup(user)) redirect("/dashboard");

  return (
    <SiteShell
      showHeader={false}
      width="3xl"
      mainClassName="flex min-h-screen items-center justify-center py-10"
    >
      <Onboarding2faForm />
    </SiteShell>
  );
}
