import { redirect } from "next/navigation";
import { SiteShell } from "@/components/app-header";
import { OnboardingPasswordForm } from "@/components/admin/onboarding-password-form";
import { getSessionUser, needsPasswordChange } from "@/lib/auth";
import { redirectToHubLogin } from "@/lib/hub";

export default async function OnboardingSenhaPage() {
  const user = await getSessionUser();
  if (!user) redirectToHubLogin("/dashboard");
  if (!needsPasswordChange(user)) {
    redirect("/dashboard/onboarding/2fa");
  }

  return (
    <SiteShell
      showHeader={false}
      width="3xl"
      mainClassName="flex min-h-screen items-center justify-center py-10"
    >
      <OnboardingPasswordForm />
    </SiteShell>
  );
}
