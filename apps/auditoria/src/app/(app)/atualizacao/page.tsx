import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { SyncSection } from "@/components/SyncSection";

export const dynamic = "force-dynamic";

export default async function AtualizacaoPage() {
  const { entitlements } = await getWorkspaceContext();
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Atualizar SALIC"
        title="Atualizar com o SALIC"
        description="Traz do SALIC os projetos e pagamentos de todos os proponentes cadastrados no MAX Financeiro."
      />
      <SyncSection
        workspaceId={entitlements.workspaceId}
        syncEnabled={entitlements.syncEnabled}
      />
    </div>
  );
}
