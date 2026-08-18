import { SiteShell } from "@/components/app-header";
import { TwoFactorForm } from "@/components/admin/two-factor-form";

export default function Login2faPage() {
  return (
    <SiteShell
      showHeader={false}
      width="3xl"
      mainClassName="flex min-h-screen items-center justify-center py-10"
    >
      <TwoFactorForm />
    </SiteShell>
  );
}
