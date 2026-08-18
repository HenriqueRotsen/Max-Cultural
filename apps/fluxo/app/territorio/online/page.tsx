import Link from "next/link";
import type { Metadata } from "next";
import { listOnlineTerritoriosAction } from "@/app/actions/territorio";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import {
  TerritorioBreadcrumb,
  TerritorioKpiGrid,
} from "@/components/territorio/territorio-ui";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "SigaCultural";

export const metadata: Metadata = {
  title: `Online · Territórios · ${appName}`,
  description: "Oficinas e comunidades online (sem localidade física).",
};

export default async function TerritorioOnlineIndexPage() {
  const data = await listOnlineTerritoriosAction();

  return (
      <div className="space-y-10">
        <section className="rounded-[1.75rem] border border-brand/10 bg-[linear-gradient(145deg,#f7faf7_0%,#eef5ef_50%,#f4f1ea_100%)] px-6 py-10 md:px-10">
          <TerritorioBreadcrumb online />
          <h1 className="mt-4 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
            Online
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Oficinas e territórios remotos, sem vínculo obrigatório a cidade/UF.
          </p>
          <TerritorioKpiGrid kpis={data.kpis} />
        </section>

        <SocioBreakdownPanel socio={data.socio} />

        <section className="space-y-4">
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            Modalidades
          </h2>
          <div className="space-y-3">
            {data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma inscrição online encontrada.
              </p>
            ) : (
              data.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-emerald-700/30 hover:bg-white"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-heading text-lg font-semibold text-brand-deep">
                      {item.label}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {item.kpis.inscritos} insc. · {item.kpis.selecionados} sel.
                      · {item.kpis.oficinas} ofc.
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
