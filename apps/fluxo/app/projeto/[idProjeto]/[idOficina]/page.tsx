import Link from "next/link";
import type { Metadata } from "next";
import {
  getOficinaPageAction,
  type OficinaLocalizacao,
  type OficinaPageData,
} from "@/app/actions/projeto";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { SiteShell } from "@/components/app-header";
import { PhoneLink } from "@/components/phone-link";
import { StatusBadges, StatusKindBadge } from "@/components/status-badges";
import { buildTerritorioPath } from "@/lib/territorio-slug";
import { isOnlineRow } from "@/lib/territorio-online";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

type Props = {
  params: Promise<{ idProjeto: string; idOficina: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { idProjeto, idOficina } = await params;
  const result = await getOficinaPageAction(idProjeto, idOficina);
  if (!result.ok) return { title: `Oficina · ${appName}` };
  return {
    title: `${result.data.Nome_oficina} · ${appName}`,
    description: `Inscritos da oficina ${result.data.Nome_oficina}`,
  };
}

export default async function OficinaPage({ params }: Props) {
  const { idProjeto, idOficina } = await params;
  const result = await getOficinaPageAction(idProjeto, idOficina);
  const back = result.ok
    ? {
        href: `/projeto/${encodeURIComponent(result.data.id_projeto)}`,
        label: result.data.Nome_projeto,
      }
    : {
        href: `/projeto/${encodeURIComponent(idProjeto)}`,
        label: "Projeto",
      };

  return (
    <SiteShell
      width="5xl"
      mainClassName="pb-20"
      backHref={back.href}
      backLabel={back.label}
    >
      {!result.ok ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <h1 className="font-heading text-2xl font-semibold text-brand-deep">
            Oficina não encontrada
          </h1>
          <p className="mt-2 text-sm text-amber-900">{result.error}</p>
        </div>
      ) : (
        <OficinaView data={result.data} />
      )}
    </SiteShell>
  );
}

function LocalizacaoList({ items }: { items: OficinaLocalizacao[] }) {
  if (items.length === 0) return null;

  const presenciais = items.filter((l) => l.kind === "presencial");
  const online = items.filter((l) => l.kind === "online");

  return (
    <div className="mt-5 space-y-3">
      {presenciais.length > 0 ? (
        <div>
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Onde ocorreu
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {presenciais.map((loc) => (
              <li key={loc.href + loc.label}>
                <Link
                  href={loc.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand/15 bg-white/85 px-3 py-1.5 text-sm text-brand-deep underline-offset-2 transition hover:border-brand/30 hover:underline"
                >
                  <span>{loc.label}</span>
                  {items.length > 1 ? (
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {loc.inscritos}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {online.length > 0 ? (
        <div>
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Modalidade online
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {online.map((loc) => (
              <li key={loc.href + loc.label}>
                <Link
                  href={loc.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand/15 bg-white/85 px-3 py-1.5 text-sm text-brand-deep underline-offset-2 transition hover:border-brand/30 hover:underline"
                >
                  <span>{loc.label}</span>
                  {items.length > 1 ? (
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {loc.inscritos}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function OficinaView({ data }: { data: OficinaPageData }) {
  const { totais } = data;

  return (
    <div className="space-y-10">
      <section className="rounded-[1.75rem] border border-brand/10 bg-white px-6 py-10 md:px-10">
        <p className="font-heading text-sm font-semibold tracking-[0.18em] text-[var(--gray-400)] uppercase">
          Oficina
        </p>
        <h1 className="mt-3 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
          {data.Nome_oficina}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link
            href={`/projeto/${encodeURIComponent(data.id_projeto)}`}
            className="underline-offset-2 hover:underline"
          >
            {data.Nome_projeto}
          </Link>
          {data.Identificacao_ano_projeto
            ? ` · ${data.Identificacao_ano_projeto}`
            : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            data.PROPONENTE,
            data.PRONAC ? `PRONAC ${data.PRONAC}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <LocalizacaoList items={data.localizacoes} />

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <div className="text-xs text-muted-foreground">Inscritos</div>
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {totais.inscritos}
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <StatusKindBadge kind="selecionado" className="mb-1" />
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {totais.selecionados}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {totais.taxaSelecao}%
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <StatusKindBadge kind="participante" className="mb-1" />
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {totais.participantes}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {totais.taxaParticipacao}%
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <StatusKindBadge kind="certificado" className="mb-1" />
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {totais.certificados}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {totais.taxaCertificado}%
            </div>
          </div>
        </div>
      </section>

      <SocioBreakdownPanel socio={data.socio} />

      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            Inscritos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {totais.inscritos} pessoa(s) nesta oficina.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
          <ul className="divide-y divide-border/60">
            {data.inscritos.map((p) => {
              const online = isOnlineRow({
                territorio: p.Territorio,
                cidade: p.Cidade,
              });
              return (
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
                      {online ? (
                        <Link
                          href={buildTerritorioPath({
                            online: true,
                            territorio: p.Territorio,
                          })}
                          className="underline-offset-2 hover:underline"
                        >
                          {p.Territorio || "Online"}
                        </Link>
                      ) : p.Territorio || p.Cidade || p.Estado ? (
                        <Link
                          href={buildTerritorioPath({
                            estado: p.Estado,
                            cidade: p.Cidade,
                            territorio: p.Territorio,
                          })}
                          className="underline-offset-2 hover:underline"
                        >
                          {[p.Territorio, [p.Cidade, p.Estado].filter(Boolean).join("/")]
                            .filter(Boolean)
                            .join(" · ")}
                        </Link>
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
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
