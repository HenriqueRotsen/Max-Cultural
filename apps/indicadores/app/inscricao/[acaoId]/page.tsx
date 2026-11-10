import { SiteShell } from "@/components/app-header";
import { InscricaoForm } from "@/components/inscricao/inscricao-form";
import { getAcaoContext } from "@/app/actions/inscricoes";

type Params = Promise<{ acaoId: string }>;

export default async function InscricaoPage({ params }: { params: Params }) {
  const { acaoId } = await params;
  let context;
  try {
    context = await getAcaoContext(decodeURIComponent(acaoId));
  } catch {
    context = {
      id_projeto: decodeURIComponent(acaoId),
      id_oficina: decodeURIComponent(acaoId),
      PROPONENTE: "",
      PRONAC: "",
      Nome_projeto: "",
      Identificacao_ano_projeto: String(new Date().getFullYear()),
      Nome_oficina: decodeURIComponent(acaoId),
    };
  }

  return (
    <SiteShell width="3xl" mainClassName="pb-16 pt-4">
      <InscricaoForm
        context={context}
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? ""}
      />
    </SiteShell>
  );
}
