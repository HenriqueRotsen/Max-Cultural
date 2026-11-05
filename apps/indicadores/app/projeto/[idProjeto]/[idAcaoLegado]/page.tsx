import { permanentRedirect } from "next/navigation";

type Props = {
  params: Promise<{ idProjeto: string; idAcaoLegado: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Endereço antigo (/projeto/[id]/[ação]) → /projeto/[id]/acao/[id]. Mantém links compartilhados. */
export default async function AcaoLegadoRedirect({ params, searchParams }: Props) {
  const { idProjeto, idAcaoLegado } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  permanentRedirect(
    `/projeto/${encodeURIComponent(idProjeto)}/acao/${encodeURIComponent(idAcaoLegado)}${suffix}`,
  );
}
