import { SiteShell } from "@/components/app-header";
import { RecoverResetForm } from "@/components/admin/recover-reset-form";

type Props = { params: Promise<{ token: string }> };

export default async function RecuperarTokenPage({ params }: Props) {
  const { token } = await params;
  return (
    <SiteShell
      showHeader={false}
      width="3xl"
      mainClassName="flex min-h-screen items-center justify-center py-10"
    >
      <RecoverResetForm token={token} />
    </SiteShell>
  );
}
