import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { getAcompanhamentoAction } from "@/app/actions/acompanhamento";
import { AcompanhamentoView, type Aba } from "@/components/acompanhamento/acompanhamento-view";
import { podeVerPrestacao } from "@/lib/acompanhamento/acesso";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projetoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ABAS: Aba[] = ["comunicacao", "producao", "configuracao"];

export default async function AcompanhamentoProjetoPage({ params, searchParams }: Props) {
  await requireDashboardPermission("acompanhamento:read");
  const { projetoId } = await params;
  const sp = await searchParams;
  const [data, prest] = await Promise.all([getAcompanhamentoAction(projetoId), podeVerPrestacao()]);
  if (!data) notFound();
  const aba = ABAS.includes(sp.aba as Aba) ? (sp.aba as Aba) : "comunicacao";

  return (
    <AdminShell title={`Acompanhamento · ${data.projeto.nome}`}>
      <AcompanhamentoView data={data} abaInicial={aba} podePrestacao={prest} />
    </AdminShell>
  );
}
