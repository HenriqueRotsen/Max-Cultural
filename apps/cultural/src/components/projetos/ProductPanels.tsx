import type { ReactNode } from "react";
import type { IndicadoresHubSummary } from "@/lib/indicadores-projects";
import { formatMoney, formatWhen, type HubProjectSummary } from "@/lib/financeiro-projects";
import { BarChart, DonutChart, SocioTabs } from "./MiniCharts";

type PanelTheme = {
  accent: string;
  ink: string;
  soft: string;
  soft2: string;
  border: string;
};

const FINANCEIRO = {
  accent: "#7c3aed",
  ink: "#5b21b6",
  soft: "#f5f3ff",
  soft2: "#ede9fe",
  border: "#c4b5fd",
  paid: "#7c3aed",
  reserved: "#a78bfa",
  available: "#ddd6fe",
} satisfies PanelTheme & {
  paid: string;
  reserved: string;
  available: string;
};

const INDICADORES = {
  accent: "#0d9488",
  ink: "#115e59",
  soft: "#f0fdfa",
  soft2: "#ccfbf1",
  border: "#5eead4",
  a: "#0d9488",
  b: "#14b8a6",
  c: "#2dd4bf",
  d: "#99f6e4",
} satisfies PanelTheme & {
  a: string;
  b: string;
  c: string;
  d: string;
};

function PanelShell({
  theme,
  logoSrc,
  logoAlt,
  openHref,
  openLabel,
  children,
  actions,
}: {
  theme: PanelTheme;
  logoSrc: string;
  logoAlt: string;
  openHref?: string | null;
  openLabel: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section
      className="card flex h-full flex-col space-y-4 p-5"
      style={{
        borderColor: theme.border,
        background: `linear-gradient(165deg, ${theme.soft} 0%, #fff 42%, #fff 100%)`,
        boxShadow: `0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px ${theme.border}33`,
      }}
    >
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        <img
          src={logoSrc}
          alt={logoAlt}
          className="h-9 w-auto max-w-[180px] object-contain object-left"
        />
        {openHref ? (
          <a
            href={openHref}
            className="shrink-0 text-xs font-semibold hover:underline"
            style={{ color: theme.accent }}
          >
            {openLabel}
          </a>
        ) : (
          <span className="shrink-0 text-xs text-[var(--gray-400)]">—</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4">{children}</div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-black/[0.06] pt-4">
        {actions}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  soft,
  accent,
}: {
  label: string;
  value: string;
  soft: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{ borderColor: `${accent}33`, background: soft }}
    >
      <p className="text-[11px] uppercase tracking-wide text-[var(--gray-500)]">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[var(--gray-400)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-[var(--navy)]">{value}</dd>
    </div>
  );
}

function ThemeBtn({
  href,
  children,
  accent,
  soft,
}: {
  href: string;
  children: ReactNode;
  accent: string;
  soft: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-[10px] border px-3 py-1.5 text-sm font-semibold transition hover:brightness-95"
      style={{
        borderColor: `${accent}55`,
        background: soft,
        color: accent,
      }}
    >
      {children}
    </a>
  );
}

export function FinanceiroPanel({
  project,
  financeiroBase,
}: {
  project: HubProjectSummary;
  financeiroBase: string;
}) {
  const t = FINANCEIRO;
  const teto = Number.isFinite(project.totalAvailableCap)
    ? project.totalAvailableCap
    : project.totalApproved;
  const paid = Math.max(0, project.totalPaid);
  const saldo = Number.isFinite(project.totalSaldo) ? project.totalSaldo : 0;
  const pctLabel =
    project.pctCaptadoT > 0
      ? `${(project.pctCaptadoT * 100).toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })}%`
      : null;
  // Donut sobre o teto: Pago + Saldo. Se pago > teto, mostra fatia "Acima do teto"
  // (não rotular isso como Saldo).
  const slices =
    teto > 0 && paid > teto
      ? [
          { label: "Pago (no teto)", value: teto, color: t.paid },
          {
            label: "Acima do teto",
            value: paid - teto,
            color: "#f59e0b",
          },
        ]
      : [
          { label: "Pago", value: paid, color: t.paid },
          { label: "Saldo", value: Math.max(0, saldo), color: t.available },
        ];

  return (
    <PanelShell
      theme={t}
      logoSrc="/brand/max-financeiro.png"
      logoAlt="MAX Financeiro"
      openHref={project.financeiroPlanejamentoUrl}
      openLabel="Abrir planejamento"
      actions={
        <>
          <ThemeBtn href={`${financeiroBase}/auditoria`} accent={t.accent} soft={t.soft2}>
            Auditoria
          </ThemeBtn>
          <ThemeBtn href={`${financeiroBase}/painel`} accent={t.accent} soft={t.soft2}>
            Painel
          </ThemeBtn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Aprovado (MinC)"
          value={formatMoney(project.totalApproved)}
          soft={t.soft2}
          accent={t.ink}
        />
        <Stat
          label={pctLabel ? `Teto (${pctLabel})` : "Teto"}
          value={formatMoney(teto)}
          soft={t.soft2}
          accent={t.ink}
        />
        <Stat
          label="Reservado"
          value={formatMoney(project.totalReserved)}
          soft={t.soft2}
          accent={t.ink}
        />
        <Stat
          label="Pago"
          value={formatMoney(project.totalPaid)}
          soft={t.soft2}
          accent={t.ink}
        />
        <div className="col-span-2">
          <Stat
            label="Saldo"
            value={formatMoney(saldo)}
            soft={saldo < 0 ? "#fef3c7" : t.soft2}
            accent={saldo < 0 ? "#b45309" : t.ink}
          />
          <p className="mt-1 px-1 text-[11px] text-[var(--gray-500)]">
            Saldo = teto − pago (inclui comprovado no SALIC; reservas em aberto não
            entram).
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
          Uso do teto
        </p>
        <DonutChart
          accent={t.accent}
          money
          centerLabel="Teto"
          slices={
            teto > 0
              ? slices
              : [{ label: "Sem valores", value: 1, color: t.available }]
          }
        />
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        <Meta
          label="Planilha"
          value={project.hasSheet ? project.importSourceLabel : "Sem planilha"}
        />
        <Meta label="Documentos" value={String(project.documentsCount)} />
        <Meta label="Reservas" value={String(project.commitmentsCount)} />
        <Meta label="Atualizado" value={formatWhen(project.updatedAt)} />
      </dl>
    </PanelShell>
  );
}

export function IndicadoresPanel({
  indicadores,
  error,
  indicadoresBase,
}: {
  indicadores: IndicadoresHubSummary | null;
  error?: string;
  indicadoresBase: string;
}) {
  const t = INDICADORES;
  const found = Boolean(indicadores?.found);

  return (
    <PanelShell
      theme={t}
      logoSrc="/brand/max-indicadores.png"
      logoAlt="MAX Indicadores"
      openHref={found && indicadores?.indicadoresUrl ? indicadores.indicadoresUrl : null}
      openLabel="Abrir no MAX Indicadores"
      actions={
        <>
          <ThemeBtn href={`${indicadoresBase}/dashboard`} accent={t.accent} soft={t.soft2}>
            Painel Indicadores
          </ThemeBtn>
          <ThemeBtn href={`${indicadoresBase}/dashboard/analise`} accent={t.accent} soft={t.soft2}>
            Análise
          </ThemeBtn>
        </>
      }
    >
      {error ? <p className="text-sm text-amber-800">{error}</p> : null}

      {!error && !found ? (
        <p className="text-sm text-[var(--gray-500)]">
          Sem dados de inscrição no MAX Indicadores para este código.
        </p>
      ) : null}

      {found && indicadores ? (
        <>
          {indicadores.projetos.length > 0 ? (
            <dl className="grid gap-2 sm:grid-cols-2">
              <Meta
                label={indicadores.projetos.length > 1 ? "Projetos" : "Projeto"}
                value={
                  indicadores.projetos.length === 1
                    ? `${indicadores.projetos[0]!.nome} · ${indicadores.projetos[0]!.ano}`
                    : `${indicadores.projetos.length} vinculados · ${indicadores.projetos[0]!.nome}…`
                }
              />
              <Meta label="PRONAC" value={indicadores.pronac} />
            </dl>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Inscritos" value={String(indicadores.totais.inscritos)} soft={t.soft2} accent={t.ink} />
            <Stat
              label="Selecionados"
              value={String(indicadores.totais.selecionados)}
              soft={t.soft2}
              accent={t.ink}
            />
            <Stat
              label="Participantes"
              value={String(indicadores.totais.participantes)}
              soft={t.soft2}
              accent={t.ink}
            />
            <Stat
              label="Certificados"
              value={String(indicadores.totais.certificados)}
              soft={t.soft2}
              accent={t.ink}
            />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
              Funil
            </p>
            <BarChart
              accent={t.accent}
              items={[
                { label: "Inscritos", value: indicadores.totais.inscritos },
                { label: "Selecionados", value: indicadores.totais.selecionados },
                { label: "Participantes", value: indicadores.totais.participantes },
                { label: "Certificados", value: indicadores.totais.certificados },
              ]}
            />
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Meta label="Oficinas" value={String(indicadores.totais.oficinas)} />
              <Meta label="Seleção" value={`${indicadores.totais.taxaSelecao}%`} />
              <Meta label="Participação" value={`${indicadores.totais.taxaParticipacao}%`} />
              <Meta label="Certificação" value={`${indicadores.totais.taxaCertificado}%`} />
            </dl>
          </div>

          {indicadores.topEstados.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                Principais UFs
              </p>
              <BarChart
                accent={t.b}
                items={indicadores.topEstados.map((e) => ({
                  label: e.estado,
                  value: e.inscritos,
                }))}
              />
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
              Sociodemográfico
            </p>
            <SocioTabs
              accent={t.accent}
              soft={t.soft2}
              byCohort={indicadores.socioByCohort}
              sections={[
                { id: "genero", title: "Gênero", items: indicadores.socio?.genero ?? [] },
                { id: "idade", title: "Idade", items: indicadores.socio?.idade ?? [] },
                { id: "etnia", title: "Etnia", items: indicadores.socio?.etnia ?? [] },
                {
                  id: "escolaridade",
                  title: "Escolaridade",
                  items: indicadores.socio?.escolaridade ?? [],
                },
                {
                  id: "deficiencia",
                  title: "Deficiência",
                  items: indicadores.socio?.deficienca ?? [],
                },
              ]}
            />
          </div>
        </>
      ) : null}
    </PanelShell>
  );
}
