import Link from "next/link";
import type { Metadata } from "next";
import { getEstadoPageAction } from "@/app/actions/territorio";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { TerritorioMapClient } from "@/components/territorio/territorio-map-client";
import {
  TerritorioBreadcrumb,
  TerritorioKpiGrid,
} from "@/components/territorio/territorio-ui";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

type Props = {
  params: Promise<{ uf: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uf } = await params;
  const result = await getEstadoPageAction(uf);
  if (!result.ok) return { title: `Estado · ${appName}` };
  return {
    title: `${result.data.estado} · Territórios · ${appName}`,
    description: `Análise territorial do estado ${result.data.estado}`,
  };
}

export default async function TerritorioEstadoPage({ params }: Props) {
  const { uf } = await params;
  const result = await getEstadoPageAction(uf);

  return (
      <>
      {!result.ok ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <h1 className="font-heading text-2xl font-semibold text-brand-deep">
            Estado não encontrado
          </h1>
          <p className="mt-2 text-sm text-amber-900">{result.error}</p>
          <Link
            href="/territorio"
            className="mt-4 inline-block text-sm text-brand underline-offset-2 hover:underline"
          >
            Voltar aos territórios
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="rounded-[1.75rem] border border-brand/10 bg-white px-6 py-10 md:px-10">
            <TerritorioBreadcrumb estado={result.data.estado} />
            <h1 className="mt-4 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
              {result.data.estado}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Cidades e comunidades com inscrições neste estado.
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

          <section className="space-y-4">
            <h2 className="font-heading text-2xl font-semibold text-brand-deep">
              Cidades
            </h2>
            <div className="space-y-3">
              {result.data.cidades.map((c) => (
                <Link
                  key={c.cidade}
                  href={c.href}
                  className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-brand/30 hover:bg-white"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-heading text-lg font-semibold text-brand-deep">
                        {c.cidade}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.territorios} território(s) / comunidade(s)
                      </div>
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {c.kpis.inscritos} insc. · {c.kpis.selecionados} sel. ·{" "}
                      {c.kpis.participantes} part.
                    </div>
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
