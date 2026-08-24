import Link from "next/link";
import type { Metadata } from "next";
import { getContextoPanoramaAction } from "@/app/actions/programa";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { SiteShell } from "@/components/app-header";
import { StatusKindBadge } from "@/components/status-badges";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getContextoPanoramaAction(id);
  if (!result.ok) return { title: `Contexto · ${appName}` };
  return {
    title: `${result.data.label} · Contexto · ${appName}`,
    description: `Panorama das edições de ${result.data.label}`,
  };
}

export default async function ContextoPage({ params }: Props) {
  const { id } = await params;
  const result = await getContextoPanoramaAction(id);

  return (
    <SiteShell width="5xl" mainClassName="pb-20">
      {!result.ok ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <h1 className="font-heading text-2xl font-semibold text-brand-deep">
            Contexto não encontrado
          </h1>
          <p className="mt-2 text-sm text-amber-900">{result.error}</p>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="rounded-[1.75rem] border border-brand/10 bg-white px-6 py-10 md:px-10">
            <p className="font-heading text-sm font-semibold tracking-[0.18em] text-[var(--gray-400)] uppercase">
              Contexto
            </p>
            <h1 className="mt-3 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
              {result.data.label}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Linha do tempo das edições (projetos) deste contexto.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Edições</div>
                <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
                  {result.data.totais.edicoes}
                </div>
              </div>
              <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Inscritos</div>
                <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
                  {result.data.totais.inscritos}
                </div>
              </div>
              <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
                <StatusKindBadge kind="selecionado" className="mb-1" />
                <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
                  {result.data.totais.selecionados}
                </div>
              </div>
              <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
                <StatusKindBadge kind="participante" className="mb-1" />
                <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
                  {result.data.totais.participantes}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-heading text-2xl font-semibold text-brand-deep">
              Linha do tempo
            </h2>
            <ol className="relative space-y-4 border-l border-brand/20 pl-6">
              {result.data.edicoes.map((e) => (
                <li key={e.id_projeto} className="relative">
                  <span className="absolute -left-[1.625rem] top-2 size-3 rounded-full bg-brand ring-4 ring-white" />
                  <Link
                    href={e.href}
                    className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-brand/30 hover:bg-white"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs font-semibold tracking-wide text-[var(--gray-400)] uppercase">
                          {e.ano}
                        </div>
                        <div className="font-heading text-lg font-semibold text-brand-deep">
                          {e.Nome_projeto}
                        </div>
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {e.inscritos} insc. · {e.selecionados} sel. ·{" "}
                        {e.oficinas} ofc.
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          <SocioBreakdownPanel socio={result.data.socio} />
        </div>
      )}
    </SiteShell>
  );
}
