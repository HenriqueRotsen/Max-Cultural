import { SiteShell } from "@/components/app-header";
import { RecoverRequestForm } from "@/components/admin/recover-request-form";

export default function RecuperarPage() {
  return (
    <SiteShell
      showHeader={false}
      width="3xl"
      mainClassName="flex min-h-screen items-center justify-center py-10"
    >
      <RecoverRequestForm />
    </SiteShell>
  );
}
