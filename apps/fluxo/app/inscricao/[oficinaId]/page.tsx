import { SiteShell } from "@/components/app-header";
import { InscricaoForm } from "@/components/inscricao/inscricao-form";
import { getOficinaContext } from "@/app/actions/inscricoes";

type Params = Promise<{ oficinaId: string }>;

export default async function InscricaoPage({ params }: { params: Params }) {
  const { oficinaId } = await params;
  let context;
  try {
    context = await getOficinaContext(decodeURIComponent(oficinaId));
  } catch {
    context = {
      id_projeto: decodeURIComponent(oficinaId),
      id_oficina: decodeURIComponent(oficinaId),
      PROPONENTE: "",
      PRONAC: "",
      Nome_projeto: "",
      Identificacao_ano_projeto: String(new Date().getFullYear()),
      Nome_oficina: decodeURIComponent(oficinaId),
    };
  }

  return (
    <SiteShell width="3xl" mainClassName="pb-16 pt-4">
      <InscricaoForm context={context} />
    </SiteShell>
  );
}
