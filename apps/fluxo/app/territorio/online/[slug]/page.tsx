import Link from "next/link";
import type { Metadata } from "next";
import { getOnlineTerritorioPageAction } from "@/app/actions/territorio";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { PhoneLink } from "@/components/phone-link";
import { StatusBadges } from "@/components/status-badges";
import {
  TerritorioBreadcrumb,
  TerritorioKpiGrid,
} from "@/components/territorio/territorio-ui";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "SigaCultural";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getOnlineTerritorioPageAction(slug);
  if (!result.ok) return { title: `Online · ${appName}` };
  return {
    title: `${result.data.label} · Online · ${appName}`,
    description: `Oficina online: ${result.data.label}`,
  };
}

export default async function TerritorioOnlineDetailPage({ params }: Props) {
  const { slug } = await params;
  const result = await getOnlineTerritorioPageAction(slug);

  return (
      <>
      {!result.ok ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <h1 className="font-heading text-2xl font-semibold text-brand-deep">
            Não encontrado
          </h1>
          <p className="mt-2 text-sm text-amber-900">{result.error}</p>
          <Link
            href="/territorio/online"
            className="mt-4 inline-block text-sm text-emerald-800 underline-offset-2 hover:underline"
          >
            Voltar ao online
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="rounded-[1.75rem] border border-brand/10 bg-[linear-gradient(145deg,#f7faf7_0%,#eef5ef_50%,#f4f1ea_100%)] px-6 py-10 md:px-10">
            <TerritorioBreadcrumb online territorio={result.data.label} />
            <h1 className="mt-4 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
              {result.data.label}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Modalidade online</p>
            <TerritorioKpiGrid kpis={result.data.kpis} />
          </section>

          <SocioBreakdownPanel socio={result.data.socio} />

          <section className="space-y-4">
            <h2 className="font-heading text-2xl font-semibold text-brand-deep">
              Oficinas
            </h2>
            <div className="space-y-3">
              {result.data.oficinas.map((o) => (
                <Link
                  key={`${o.id_projeto}-${o.id_oficina}`}
                  href={o.href}
                  className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-emerald-700/30 hover:bg-white"
                >
                  <div className="font-heading text-lg font-semibold text-brand-deep">
                    {o.Nome_oficina}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {o.Nome_projeto}
                  </div>
                  <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {o.kpis.inscritos} insc. · {o.kpis.selecionados} sel.
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-heading text-2xl font-semibold text-brand-deep">
              Inscritos
            </h2>
            <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
              <ul className="divide-y divide-border/60">
                {result.data.inscritos.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-brand-deep">{p.Nome}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {p.CPF ? (
                          <Link
                            href={`/pessoa/${p.CPF.replace(/\D/g, "")}`}
                            className="font-mono underline-offset-2 hover:underline"
                          >
                            {p.cpfDisplay}
                          </Link>
                        ) : null}
                        {p["E-mail"] ? <span>{p["E-mail"]}</span> : null}
                        {p.telefoneDisplay ? (
                          <PhoneLink
                            phone={p.Telefone}
                            label={p.telefoneDisplay}
                          />
                        ) : null}
                      </div>
                    </div>
                    <StatusBadges
                      selecionado={p.Selecionados === 1}
                      participante={p.Participantes === 1}
                      certificado={p.Certificado === 1}
                      showNaoSelecionado
                    />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
      </>
  );
}
