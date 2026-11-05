import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { getPrestacaoProjetoAction } from "@/app/actions/prestacao";
import { PrestacaoProjetoView, type AbaPrestacao } from "@/components/prestacao/prestacao-projeto-view";
import { podeVerAcompanhamento } from "@/lib/acompanhamento/acesso";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projetoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ABAS: AbaPrestacao[] = ["fichas", "relatorios", "produtos", "dados"];

export default async function PrestacaoProjetoPage({ params, searchParams }: Props) {
  await requireDashboardPermission("prestacao:read");
  const { projetoId } = await params;
  const sp = await searchParams;
  const [data, acomp] = await Promise.all([getPrestacaoProjetoAction(projetoId), podeVerAcompanhamento()]);
  if (!data) notFound();
  const aba = ABAS.includes(sp.aba as AbaPrestacao) ? (sp.aba as AbaPrestacao) : "fichas";
  return (
    <AdminShell title={`Prestação de contas · ${data.projeto.nome}`}>
      <PrestacaoProjetoView data={data} abaInicial={aba} podeAcompanhamento={acomp} />
    </AdminShell>
  );
}
