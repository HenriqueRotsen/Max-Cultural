"use client";

import Link from "next/link";
import {
  MapPin,
  Users,
  GraduationCap,
  Mail,
  Phone,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneLink } from "@/components/phone-link";
import { StatusBadges, StatusKindBadge } from "@/components/status-badges";
import type { PessoaAnalise, PessoaPerfil } from "@/app/actions/pessoa";
import { buildTerritorioPath } from "@/lib/territorio-slug";

function MetricBar({
  value,
  max,
  tone = "emerald",
}: {
  value: number;
  max: number;
  tone?: "emerald" | "amber" | "sky" | "teal";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colors = {
    emerald: "bg-emerald-700",
    amber: "bg-amber-500",
    sky: "bg-sky-600",
    teal: "bg-teal-600",
  };
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-brand-mist">
        <div
          className={cn("h-full rounded-full transition-all duration-700", colors[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FunilVisual({ funil }: { funil: PessoaAnalise["funil"] }) {
  const stages = [
    {
      key: "inscritos",
      label: "Inscrições",
      value: funil.inscritos,
      tone: "emerald" as const,
      status: null as null | "selecionado" | "participante" | "certificado",
    },
    {
      key: "selecionados",
      label: "Selecionado",
      value: funil.selecionados,
      tone: "sky" as const,
      status: "selecionado" as const,
    },
    {
      key: "participantes",
      label: "Participante",
      value: funil.participantes,
      tone: "teal" as const,
      status: "participante" as const,
    },
    {
      key: "certificados",
      label: "Certificado",
      value: funil.certificados,
      tone: "amber" as const,
      status: "certificado" as const,
    },
  ];
  const max = Math.max(funil.inscritos, 1);

  return (
    <div className="space-y-4">
      {stages.map((stage, i) => {
        const width = Math.max(28, (stage.value / max) * 100);
        return (
          <div key={stage.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium text-brand-deep">
                <span className="text-muted-foreground">{i + 1}.</span>
                {stage.status ? (
                  <StatusKindBadge kind={stage.status} />
                ) : (
                  stage.label
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {stage.value}
                <span className="ml-1 text-xs">
                  ({Math.round((stage.value / max) * 100)}%)
                </span>
              </span>
            </div>
            <div className="flex justify-center">
              <div
                className={cn(
                  "h-10 rounded-md transition-all duration-700",
                  stage.tone === "emerald" && "bg-emerald-700/90",
                  stage.tone === "sky" && "bg-sky-600/90",
                  stage.tone === "teal" && "bg-teal-600/90",
                  stage.tone === "amber" && "bg-amber-500/90",
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-emerald-800/70" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium text-brand-deep">{value}</div>
      </div>
    </div>
  );
}

type Props = {
  pessoa: PessoaPerfil;
};

export function PessoaView({ pessoa }: Props) {
  const { analise } = pessoa;
  const maxProjeto = Math.max(...analise.porProjeto.map((p) => p.inscricoes), 1);

  return (
    <div className="space-y-14 md:space-y-20">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[1.75rem] border border-brand/10 bg-[linear-gradient(145deg,#f7faf7_0%,#eef5ef_45%,#f4f1ea_100%)] px-6 py-10 md:px-10 md:py-14">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-emerald-700/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 size-56 rounded-full bg-teal-600/10 blur-3xl" />
        <p className="sc-fade-in font-heading text-sm font-semibold tracking-[0.18em] text-emerald-900/70 uppercase">
          SigaCultural
        </p>
        <h1 className="sc-fade-up mt-3 font-heading text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-tight text-brand-deep">
          {pessoa.nome}
        </h1>
        {pessoa.apelido ? (
          <p className="sc-fade-up mt-2 text-lg text-brand-deep/70">
            “{pessoa.apelido}”
          </p>
        ) : null}
        <p className="sc-fade-up-delay mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Histórico de oficinas e projetos vinculados ao CPF {pessoa.cpfDisplay}.
        </p>
        <div className="sc-fade-up-delay-2 mt-8 flex flex-wrap gap-3">
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <div className="text-xs text-muted-foreground">Inscrições</div>
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {analise.totalInscricoes}
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <StatusKindBadge kind="selecionado" className="mb-1" />
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {analise.vezesSelecionado}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({analise.taxaSelecao}%)
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-white/80 px-4 py-3 shadow-sm">
            <div className="text-xs text-muted-foreground">Projetos</div>
            <div className="font-heading text-2xl font-semibold tabular-nums text-brand-deep">
              {analise.projetosUnicos}
            </div>
          </div>
        </div>
      </section>

      {/* Dados pessoais */}
      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            Dados pessoais
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Informações consolidadas a partir das inscrições deste CPF.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact icon={Mail} label="E-mail" value={pessoa.email} />
          <Fact
            icon={Phone}
            label="Telefone"
            value={
              pessoa.telefone ? (
                <PhoneLink
                  phone={pessoa.telefone}
                  label={pessoa.telefoneDisplay || undefined}
                />
              ) : (
                pessoa.telefoneDisplay
              )
            }
          />
          <Fact icon={Calendar} label="Nascimento" value={pessoa.dataNascimento} />
          <Fact icon={Users} label="Gênero" value={pessoa.genero} />
          <Fact icon={GraduationCap} label="Escolaridade" value={pessoa.escolaridade} />
          <Fact
            icon={MapPin}
            label="Cidade / UF"
            value={
              pessoa.cidade || pessoa.estado ? (
                pessoa.cidade && pessoa.estado ? (
                  <Link
                    href={buildTerritorioPath({
                      estado: pessoa.estado,
                      cidade: pessoa.cidade,
                    })}
                    className="underline-offset-2 hover:underline"
                  >
                    {[pessoa.cidade, pessoa.estado].filter(Boolean).join(" / ")}
                  </Link>
                ) : (
                  [pessoa.cidade, pessoa.estado].filter(Boolean).join(" / ")
                )
              ) : (
                ""
              )
            }
          />
          <Fact
            icon={MapPin}
            label="Território (comunidade)"
            value={
              pessoa.territorio && pessoa.cidade && pessoa.estado ? (
                <Link
                  href={buildTerritorioPath({
                    estado: pessoa.estado,
                    cidade: pessoa.cidade,
                    territorio: pessoa.territorio,
                  })}
                  className="underline-offset-2 hover:underline"
                >
                  {pessoa.territorio}
                </Link>
              ) : (
                pessoa.territorio
              )
            }
          />
          <Fact
            icon={Users}
            label="Deficiência"
            value={pessoa.possuiDeficiencia}
          />
          <Fact
            icon={Users}
            label="Restrição alimentar"
            value={pessoa.restricaoAlimentar}
          />
        </div>
      </section>

      {/* Inscrições */}
      <section className="space-y-4" id="inscricoes">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            Oficinas e projetos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada inscrição e o status de seleção, participação e certificado.
          </p>
        </div>
        <div className="space-y-3">
          {pessoa.inscricoes.map((insc) => (
            <article
              key={insc.id}
              className="rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-emerald-700/25"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h3 className="font-heading text-lg font-semibold text-brand-deep">
                    <Link
                      href={`/projeto/${encodeURIComponent(insc.id_projeto)}/${encodeURIComponent(insc.id_oficina)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {insc.Nome_oficina || "Oficina"}
                    </Link>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    <Link
                      href={`/projeto/${encodeURIComponent(insc.id_projeto)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {insc.Nome_projeto || "Projeto"}
                    </Link>
                    {insc.Identificacao_ano_projeto
                      ? ` · ${insc.Identificacao_ano_projeto}`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[insc.PROPONENTE, insc.PRONAC ? `PRONAC ${insc.PRONAC}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {insc.Data_inscricao ? (
                    <p className="text-xs text-muted-foreground">
                      Inscrito em {insc.Data_inscricao}
                      {insc.Territorio ? ` · ${insc.Territorio}` : ""}
                    </p>
                  ) : null}
                </div>
                <StatusBadges
                  selecionado={insc.Selecionados === 1}
                  participante={insc.Participantes === 1}
                  certificado={insc.Certificado === 1}
                  showNaoSelecionado
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Análise */}
      <section className="space-y-8" id="analise">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-brand-deep">
            Análise do percurso
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Funil de acompanhamento e distribuição por projeto e ano.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-brand/10 bg-white/90 p-5 shadow-sm md:p-6">
            <h3 className="font-heading text-lg font-semibold text-brand-deep">
              Funil
            </h3>
            <p className="mb-5 text-xs text-muted-foreground">
              Inscrição → seleção → participação → certificado
            </p>
            <FunilVisual funil={analise.funil} />
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border/60 pt-4 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Seleção</div>
                <div className="font-heading text-xl font-semibold tabular-nums">
                  {analise.taxaSelecao}%
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Participação</div>
                <div className="font-heading text-xl font-semibold tabular-nums">
                  {analise.taxaParticipacao}%
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-center">
                  <StatusKindBadge kind="certificado" />
                </div>
                <div className="font-heading text-xl font-semibold tabular-nums">
                  {analise.taxaCertificado}%
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand/10 bg-white/90 p-5 shadow-sm md:p-6">
            <h3 className="font-heading text-lg font-semibold text-brand-deep">
              Por projeto
            </h3>
            <p className="mb-5 text-xs text-muted-foreground">
              Quantas vezes esta pessoa apareceu em cada projeto
            </p>
            <div className="space-y-4">
              {analise.porProjeto.map((p) => (
                <div key={p.id_projeto} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <Link
                      href={`/projeto/${encodeURIComponent(p.id_projeto)}`}
                      className="min-w-0 truncate font-medium text-brand-deep underline-offset-2 hover:underline"
                    >
                      {p.Nome_projeto}
                    </Link>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {p.inscricoes} insc. · {p.selecionados} sel.
                    </span>
                  </div>
                  <MetricBar value={p.inscricoes} max={maxProjeto} />
                  <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusKindBadge kind="participante" />
                      <strong className="tabular-nums text-brand-deep">
                        {p.participantes}
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusKindBadge kind="certificado" />
                      <strong className="tabular-nums text-brand-deep">
                        {p.certificados}
                      </strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {analise.porAno.length > 0 ? (
          <div className="rounded-2xl border border-brand/10 bg-white/90 p-5 shadow-sm md:p-6">
            <h3 className="font-heading text-lg font-semibold text-brand-deep">
              Por ano / ciclo
            </h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analise.porAno.map((a) => (
                <div
                  key={a.ano}
                  className="rounded-xl border border-brand/10 bg-brand-mist/40 px-4 py-3"
                >
                  <div className="font-heading text-base font-semibold text-brand-deep">
                    {a.ano}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Inscrições</span>
                      <span className="tabular-nums font-medium text-brand-deep">
                        {a.inscricoes}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <StatusKindBadge kind="selecionado" />
                      <span className="tabular-nums font-medium text-brand-deep">
                        {a.selecionados}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <StatusKindBadge kind="participante" />
                      <span className="tabular-nums font-medium text-brand-deep">
                        {a.participantes}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <StatusKindBadge kind="certificado" />
                      <span className="tabular-nums font-medium text-brand-deep">
                        {a.certificados}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Página pública por CPF ·{" "}
        <Link href="/pessoa" className="underline-offset-2 hover:underline">
          consultar outro CPF
        </Link>
      </p>
    </div>
  );
}
