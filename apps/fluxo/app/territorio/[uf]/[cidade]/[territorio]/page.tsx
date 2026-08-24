import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTerritorioPageAction } from "@/app/actions/territorio";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { PhoneLink } from "@/components/phone-link";
import { StatusBadges } from "@/components/status-badges";
import { TerritorioMapClient } from "@/components/territorio/territorio-map-client";
import {
  TerritorioBreadcrumb,
  TerritorioKpiGrid,
} from "@/components/territorio/territorio-ui";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

type Props = {
  params: Promise<{ uf: string; cidade: string; territorio: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uf, cidade, territorio } = await params;
  const result = await getTerritorioPageAction(uf, cidade, territorio);
  if (!result.ok) return { title: `Território · ${appName}` };
  return {
    title: `${result.data.territorio} · ${result.data.cidade} · ${appName}`,
    description: `Comunidade ${result.data.territorio} em ${result.data.cidade}/${result.data.estado}`,
  };
}

export default async function TerritorioComunidadePage({ params }: Props) {
  const { uf, cidade, territorio } = await params;
  const result = await getTerritorioPageAction(uf, cidade, territorio);

  if (!result.ok && result.redirectHref) {
    redirect(result.redirectHref);
  }

  return (
      <>
      {!result.ok ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <h1 className="font-heading text-2xl font-semibold text-brand-deep">
            Território não encontrado
          </h1>
          <p className="mt-2 text-sm text-amber-900">{result.error}</p>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="rounded-[1.75rem] border border-brand/10 bg-white px-6 py-10 md:px-10">
            <TerritorioBreadcrumb
              estado={result.data.estado}
              cidade={result.data.cidade}
              territorio={result.data.territorio}
            />
            <p className="mt-4 font-heading text-sm font-semibold tracking-[0.18em] text-[var(--gray-400)] uppercase">
              Território (comunidade)
            </p>
            <h1 className="mt-2 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
              {result.data.territorio}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.data.cidade} · {result.data.estado}
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
              Oficinas
            </h2>
            <div className="space-y-3">
              {result.data.oficinas.map((o) => (
                <Link
                  key={`${o.id_projeto}-${o.id_oficina}`}
                  href={o.href}
                  className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-brand/30 hover:bg-white"
                >
                  <div className="font-heading text-lg font-semibold text-brand-deep">
                    {o.Nome_oficina}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {o.Nome_projeto}
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
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-brand-deep">{p.Nome}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
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
