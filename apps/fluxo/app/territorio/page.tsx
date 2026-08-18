import Link from "next/link";
import type { Metadata } from "next";
import { listTerritoriosOverviewAction } from "@/app/actions/territorio";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { TerritorioMapClient } from "@/components/territorio/territorio-map-client";
import {
  TerritorioBreadcrumb,
  TerritorioKpiGrid,
} from "@/components/territorio/territorio-ui";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "SigaCultural";

export const metadata: Metadata = {
  title: `Territórios · ${appName}`,
  description:
    "Análise territorial por estado, cidade e comunidade (quilombo, assentamento, regional).",
};

export default async function TerritorioIndexPage() {
  const data = await listTerritoriosOverviewAction();

  return (
      <div className="space-y-10">
        <section className="rounded-[1.75rem] border border-brand/10 bg-[linear-gradient(145deg,#f7faf7_0%,#eef5ef_50%,#f4f1ea_100%)] px-6 py-10 md:px-10">
          <TerritorioBreadcrumb />
          <h1 className="mt-4 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
            Análise territorial
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
            Navegue por estado → cidade → território (comunidade). O mapa usa a
            localização da cidade (UF + município).
          </p>
          <TerritorioKpiGrid kpis={data.totais} />
        </section>

        <SocioBreakdownPanel socio={data.socio} />

        <section className="space-y-3">
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            Mapa
          </h2>
          <TerritorioMapClient points={data.mapPoints} />
        </section>

        <section className="space-y-4">
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            Estados
          </h2>
          <div className="space-y-3">
            {data.online ? (
              <Link
                href={data.online.href}
                className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-emerald-700/30 hover:bg-white"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-heading text-lg font-semibold text-brand-deep">
                    Online
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {data.online.kpis.inscritos} insc. ·{" "}
                    {data.online.labels} modalidade(s)
                  </div>
                </div>
              </Link>
            ) : null}
            {data.estados.length === 0 && !data.online ? (
              <p className="text-sm text-muted-foreground">
                Nenhum estado com cidade cadastrada ainda.
              </p>
            ) : (
              data.estados.map((e) => (
                <Link
                  key={e.estado}
                  href={e.href}
                  className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-emerald-700/30 hover:bg-white"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-heading text-lg font-semibold text-brand-deep">
                      {e.estado}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {e.kpis.inscritos} insc. · {e.kpis.selecionados} sel. ·{" "}
                      {e.kpis.oficinas} ofc. · {e.kpis.projetos} proj.
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
  );
}
