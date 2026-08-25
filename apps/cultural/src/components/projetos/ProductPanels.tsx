import type { ReactNode } from "react";
import type { FluxoHubSummary } from "@/lib/fluxo-projects";
import { formatMoney, formatWhen, type HubProjectSummary } from "@/lib/origem-projects";
import { BarChart, DonutChart, SocioTabs } from "./MiniCharts";

type PanelTheme = {
  accent: string;
  ink: string;
  soft: string;
  soft2: string;
  border: string;
};

const ORIGEM = {
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

const FLUXO = {
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

export function OrigemPanel({
  project,
  origemBase,
}: {
  project: HubProjectSummary;
  origemBase: string;
}) {
  const t = ORIGEM;
  const slices = [
    { label: "Pago", value: project.totalPaid, color: t.paid },
    { label: "Reservado", value: project.totalReserved, color: t.reserved },
    { label: "Saldo", value: project.totalAvailable, color: t.available },
  ];

  return (
    <PanelShell
      theme={t}
      logoSrc="/brand/max-origem.png"
      logoAlt="MAX Origem"
      openHref={project.origemPlanejamentoUrl}
      openLabel="Abrir planejamento"
      actions={
        <>
          <ThemeBtn href={`${origemBase}/auditoria`} accent={t.accent} soft={t.soft2}>
            Auditoria
          </ThemeBtn>
          <ThemeBtn href={`${origemBase}/painel`} accent={t.accent} soft={t.soft2}>
            Painel
          </ThemeBtn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Aprovado" value={formatMoney(project.totalApproved)} soft={t.soft2} accent={t.ink} />
        <Stat label="Saldo" value={formatMoney(project.totalAvailable)} soft={t.soft2} accent={t.ink} />
        <Stat label="Reservado" value={formatMoney(project.totalReserved)} soft={t.soft2} accent={t.ink} />
        <Stat label="Pago" value={formatMoney(project.totalPaid)} soft={t.soft2} accent={t.ink} />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
          Uso do orçamento
        </p>
        <DonutChart
          accent={t.accent}
          money
          centerLabel="Aprovado"
          slices={
            project.totalApproved > 0
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

export function FluxoPanel({
  fluxo,
  error,
  fluxoBase,
}: {
  fluxo: FluxoHubSummary | null;
  error?: string;
  fluxoBase: string;
}) {
  const t = FLUXO;
  const found = Boolean(fluxo?.found);

  return (
    <PanelShell
      theme={t}
      logoSrc="/brand/max-fluxo.png"
      logoAlt="MAX Fluxo"
      openHref={found && fluxo?.fluxoUrl ? fluxo.fluxoUrl : null}
      openLabel="Abrir no Fluxo"
      actions={
        <>
          <ThemeBtn href={`${fluxoBase}/dashboard`} accent={t.accent} soft={t.soft2}>
            Painel Fluxo
          </ThemeBtn>
          <ThemeBtn href={`${fluxoBase}/dashboard/analise`} accent={t.accent} soft={t.soft2}>
            Análise
          </ThemeBtn>
        </>
      }
    >
      {error ? <p className="text-sm text-amber-800">{error}</p> : null}

      {!error && !found ? (
        <p className="text-sm text-[var(--gray-500)]">
          Sem dados de inscrição no Fluxo para este código.
        </p>
      ) : null}

      {found && fluxo ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Inscritos" value={String(fluxo.totais.inscritos)} soft={t.soft2} accent={t.ink} />
            <Stat
              label="Selecionados"
              value={String(fluxo.totais.selecionados)}
              soft={t.soft2}
              accent={t.ink}
            />
            <Stat
              label="Participantes"
              value={String(fluxo.totais.participantes)}
              soft={t.soft2}
              accent={t.ink}
            />
            <Stat
              label="Certificados"
              value={String(fluxo.totais.certificados)}
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
                { label: "Inscritos", value: fluxo.totais.inscritos },
                { label: "Selecionados", value: fluxo.totais.selecionados },
                { label: "Participantes", value: fluxo.totais.participantes },
                { label: "Certificados", value: fluxo.totais.certificados },
              ]}
            />
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Meta label="Oficinas" value={String(fluxo.totais.oficinas)} />
              <Meta label="Seleção" value={`${fluxo.totais.taxaSelecao}%`} />
              <Meta label="Participação" value={`${fluxo.totais.taxaParticipacao}%`} />
              <Meta label="Certificação" value={`${fluxo.totais.taxaCertificado}%`} />
            </dl>
          </div>

          {fluxo.topEstados.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                Principais UFs
              </p>
              <BarChart
                accent={t.b}
                items={fluxo.topEstados.map((e) => ({
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
              sections={[
                { id: "genero", title: "Gênero", items: fluxo.socio?.genero ?? [] },
                { id: "idade", title: "Idade", items: fluxo.socio?.idade ?? [] },
                { id: "etnia", title: "Etnia", items: fluxo.socio?.etnia ?? [] },
                {
                  id: "escolaridade",
                  title: "Escolaridade",
                  items: fluxo.socio?.escolaridade ?? [],
                },
                {
                  id: "deficiencia",
                  title: "Deficiência",
                  items: fluxo.socio?.deficienca ?? [],
                },
              ]}
            />
          </div>
        </>
      ) : null}
    </PanelShell>
  );
}
