import { AdminShell } from "@/components/admin/admin-shell";
import { ProfileForm } from "@/components/admin/profile-form";
import { requireDashboardUser } from "@/lib/dashboard-gate";
import { getOwnProfileSummary } from "@/lib/profile-summary";
import { is2faDisabled } from "@/lib/totp";

export default async function PerfilPage() {
  const user = await requireDashboardUser();
  const summary = await getOwnProfileSummary(user.id);

  return (
    <AdminShell title="Meu perfil">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand-deep">
          Meu perfil
        </h1>
        <p className="text-sm text-muted-foreground">
          Dados da conta, seu acesso no painel e segurança.
        </p>
      </div>
      <ProfileForm
        name={user.name}
        email={user.email}
        totpEnabled={user.totpEnabled}
        twoFaDisabledEnv={is2faDisabled()}
        summary={summary}
      />
    </AdminShell>
  );
}
