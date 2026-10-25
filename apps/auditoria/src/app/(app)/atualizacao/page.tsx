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
        description="Traz do SALIC os projetos e pagamentos de cada proponente para o espelho da Auditoria. Roda sozinho todo dia; aqui você acompanha ou dispara uma atualização. Os proponentes são cadastrados no MAX Origem."
      />
      <SyncSection
        workspaceId={entitlements.workspaceId}
        syncEnabled={entitlements.syncEnabled}
      />
    </div>
  );
}
