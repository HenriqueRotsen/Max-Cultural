import Link from "next/link";
import type { Metadata } from "next";
import type { ProjetoPageData } from "@/app/actions/projeto";
import { getProjetoPageAction } from "@/app/actions/projeto";
import { AcompanhamentoLink } from "@/components/acompanhamento/acompanhamento-link";
import { podeVerAcompanhamento, podeVerPrestacao } from "@/lib/acompanhamento/acesso";
import { PrestacaoLink } from "@/components/prestacao/prestacao-link";
import { SocioBreakdownPanel } from "@/components/analise/socio-breakdown";
import { ProjetoContextEditor } from "@/components/admin/projeto-context-editor";
import { SiteShell } from "@/components/app-header";
import { StatusKindBadge } from "@/components/status-badges";
import { parseSocioCohort } from "@/lib/socio";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Indicadores";

type Props = {
  params: Promise<{ idProjeto: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { idProjeto } = await params;
  const result = await getProjetoPageAction(idProjeto);
  if (!result.ok) return { title: `Projeto · ${appName}` };
  return {
    title: `${result.data.Nome_projeto} · ${appName}`,
    description: `Ações e indicadores do projeto ${result.data.Nome_projeto}`,
  };
}

export default async function ProjetoPage({ params, searchParams }: Props) {
  const { idProjeto } = await params;
  const cohort = parseSocioCohort((await searchParams).perfil);
  const [result, acomp, prest] = await Promise.all([
    getProjetoPageAction(idProjeto, cohort),
    podeVerAcompanhamento(),
    podeVerPrestacao(),
  ]);
  const back = result.ok
    ? {
        href: `/contexto/${encodeURIComponent(result.data.contextoId)}`,
        label: result.data.contextoNome,
      }
    : { href: "/dashboard/analise", label: "Análise" };

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
            Projeto não encontrado
          </h1>
          <p className="mt-2 text-sm text-amber-900">{result.error}</p>
        </div>
      ) : (
        <ProjetoView data={result.data} cohort={cohort} acomp={acomp} prest={prest} />
      )}
    </SiteShell>
  );
}

function ProjetoView({
  data,
  cohort,
  acomp,
  prest,
}: {
  data: ProjetoPageData;
  cohort: ReturnType<typeof parseSocioCohort>;
  acomp: boolean;
  prest: boolean;
}) {
  return (
    <div className="space-y-10">
      <section className="rounded-[1.75rem] border border-brand/10 bg-white px-6 py-10 md:px-10">
        <p className="font-heading text-sm font-semibold tracking-[0.18em] text-[var(--gray-400)] uppercase">
          Projeto
        </p>
        <h1 className="mt-3 font-heading text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-brand-deep">
          {data.Nome_projeto}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {[
            data.PROPONENTE,
            data.PRONAC ? `PRONAC ${data.PRONAC}` : "",
            data.Identificacao_ano_projeto,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {acomp || prest ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {acomp ? <AcompanhamentoLink projetoId={data.id_projeto} /> : null}
            {prest ? <PrestacaoLink projetoId={data.id_projeto} /> : null}
          </div>
        ) : null}
        {data.canEditContexto ? (
          <ProjetoContextEditor
            projetoId={data.id_projeto}
            contextoId={data.contextoId}
            contextoNome={data.contextoNome}
          />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Contexto:{" "}
            <Link
              href={`/contexto/${encodeURIComponent(data.contextoId)}`}
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              {data.contextoNome}
            </Link>
          </p>
        )}
        {data.programa && data.programa.siblings > 1 ? (
          <p className="mt-3">
            <Link
              href={`/contexto/${encodeURIComponent(data.programa.id)}`}
              className="text-sm font-medium text-brand underline-offset-2 hover:underline"
            >
              Ver todas as edições ({data.programa.siblings})
            </Link>
          </p>
        ) : null}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <div className="text-xs text-muted-foreground">Ações</div>
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {data.totais.acoes}
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <div className="text-xs text-muted-foreground">Inscritos</div>
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {data.totais.inscritos}
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <StatusKindBadge kind="selecionado" className="mb-1" />
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {data.totais.selecionados}
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <StatusKindBadge kind="participante" className="mb-1" />
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {data.totais.participantes}
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <StatusKindBadge kind="certificado" className="mb-1" />
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {data.totais.certificados}
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <div className="text-xs text-muted-foreground">CPFs únicos</div>
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {data.totais.cpfsUnicos}
            </div>
          </div>
        </div>
      </section>

      <SocioBreakdownPanel socio={data.socio} cohort={cohort} />

      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            Ações
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada ação deste projeto — clique para ver a lista de inscritos.
            {data.totais.acoes === 0
              ? " Ainda não há ações cadastradas."
              : null}
          </p>
        </div>
        {data.acoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma ação. Cadastre em{" "}
            <Link
              href="/dashboard/contextos?tab=acoes"
              className="text-brand underline-offset-2 hover:underline"
            >
              Contextos → Ações
            </Link>
            .
          </p>
        ) : (
        <div className="space-y-3">
          {data.acoes.map((o) => (
            <Link
              key={o.id_oficina}
              href={`/projeto/${encodeURIComponent(data.id_projeto)}/acao/${encodeURIComponent(o.id_oficina)}`}
              className="block rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-brand/30 hover:bg-white"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-heading text-lg font-semibold text-brand-deep">
                    {o.Nome_oficina}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs tabular-nums">
                  <span className="text-muted-foreground">
                    Insc.{" "}
                    <strong className="text-brand-deep">{o.inscritos}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusKindBadge kind="selecionado" />
                    <strong className="text-brand-deep">{o.selecionados}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusKindBadge kind="participante" />
                    <strong className="text-brand-deep">{o.participantes}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusKindBadge kind="certificado" />
                    <strong className="text-brand-deep">{o.certificados}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    CPFs únicos{" "}
                    <strong className="text-brand-deep">{o.cpfsUnicos}</strong>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        )}
      </section>
    </div>
  );
}
