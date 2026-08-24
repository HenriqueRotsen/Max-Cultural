import { PageHeader } from "@/components/ui";
import { ProjectSheetComparePanel } from "@/components/ProjectSheetComparePanel";

export const dynamic = "force-dynamic";

export default function CompararPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Início › Comparar"
        title="Comparar planilha"
        description="Cruza a relação de projetos (Excel) com os PRONACs do MAX Origem — captado, IN, proponente e limites."
      />
      <ProjectSheetComparePanel />
    </div>
  );
}
