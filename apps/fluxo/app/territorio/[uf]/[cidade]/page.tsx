import Link from "next/link";
import type { Metadata } from "next";
import { getCidadePageAction } from "@/app/actions/territorio";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { TerritorioMapClient } from "@/components/territorio/territorio-map-client";
import {
  TerritorioBreadcrumb,
  TerritorioKpiGrid,
} from "@/components/territorio/territorio-ui";
import { StatusKindBadge } from "@/components/status-badges";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "SigaCultural";

type Props = {
  params: Promise<{ uf: string; cidade: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uf, cidade } = await params;
  const result = await getCidadePageAction(uf, cidade);
  if (!result.ok) return { title: `Cidade · ${appName}` };
  return {
    title: `${result.data.cidade} · ${result.data.estado} · ${appName}`,
    description: `Análise territorial de ${result.data.cidade}/${result.data.estado}`,
  };
}

export default async function TerritorioCidadePage({ params }: Props) {
  const { uf, cidade } = await params;
  const result = await getCidadePageAction(uf, cidade);

  return (
      <>
      {!result.ok ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <h1 className="font-heading text-2xl font-semibold text-brand-deep">
            Cidade não encontrada
          </h1>
          <p className="mt-2 text-sm text-amber-900">{result.error}</p>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="rounded-[1.75rem] border border-brand/10 bg-[linear-gradient(145deg,#f7faf7_0%,#eef5ef_50%,#f4f1ea_100%)] px-6 py-10 md:px-10">
            <TerritorioBreadcrumb
              estado={result.data.estado}
              cidade={result.data.cidade}
            />
            <h1 className="mt-4 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
              {result.data.cidade}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.data.estado}
            </p>
            <TerritorioKpiGrid kpis={result.data.kpis} />
          </section>

          <SocioBreakdownPanel socio={result.data.socio} />

          <section className="space-y-3">
            <h2 className="font-heading text-2xl font-semibold text-brand-deep">
              Mapa
            </h2>
            <TerritorioMapClient points={result.data.mapPoints} />
          </section>

          {result.data.territorios.length > 0 ? (
            <section className="space-y-4">
              <div>
                <h2 className="font-heading text-2xl font-semibold text-brand-deep">
                  Territórios (comunidades)
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quilombos, regionais, assentamentos e outras comunidades nesta
                  cidade.
                </p>
              </div>
              <div className="space-y-3">
                {result.data.territorios.map((t) => (
                  <Link
                    key={t.territorio}
                    href={t.href}
                    className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-emerald-700/30 hover:bg-white"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-heading text-lg font-semibold text-brand-deep">
                        {t.territorio}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                        <span>{t.kpis.inscritos} insc.</span>
                        <StatusKindBadge kind="selecionado" />
                        <strong>{t.kpis.selecionados}</strong>
                        <StatusKindBadge kind="participante" />
                        <strong>{t.kpis.participantes}</strong>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

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
                  <div className="text-xs text-muted-foreground">
                    {o.Nome_projeto}
                  </div>
                  <div className="mt-2 text-xs tabular-nums text-muted-foreground">
                    {o.kpis.inscritos} insc. · {o.kpis.selecionados} sel. ·{" "}
                    {o.kpis.participantes} part.
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
      </>
  );
}
