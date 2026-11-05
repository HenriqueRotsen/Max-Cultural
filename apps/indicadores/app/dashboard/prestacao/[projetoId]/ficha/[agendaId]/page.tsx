import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { getFichaAction } from "@/app/actions/prestacao";
import { FichaView } from "@/components/prestacao/ficha-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ projetoId: string; agendaId: string }> };

export default async function FichaPage({ params }: Props) {
  await requireDashboardPermission("prestacao:read");
  const { projetoId, agendaId } = await params;
  const ficha = await getFichaAction(agendaId);
  if (!ficha || ficha.projetoId !== projetoId) notFound();
  return (
    <AdminShell title={`Ficha · ${ficha.sistema.acao}`}>
      <FichaView ficha={ficha} />
    </AdminShell>
  );
}
