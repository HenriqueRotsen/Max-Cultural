import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  importSourceLabel,
  jurisdictionLabel,
} from "@/lib/planning/lifecycle";
import { computeProjectBalance } from "@/lib/planning/rubric-balance";

export const dynamic = "force-dynamic";

function money(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (
    typeof v === "object" &&
    typeof (v as { toNumber?: () => number }).toNumber === "function"
  ) {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

export default async function PlanejamentoIndexPage() {
  const { entitlements } = await getWorkspaceContext();

  const projects = await prisma.planningProject.findMany({
    where: { workspaceId: entitlements.workspaceId },
    orderBy: [{ name: "asc" }, { externalCode: "asc" }],
    include: {
      account: { select: { name: true } },
      sheet: { include: { lines: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
      project: { select: { situacao: true, valorCaptado: true } },
    },
  });

  const emAndamento = projects.filter((p) => p.lifecycleStatus !== "ENCERRADO");
  const encerrados = projects.filter((p) => p.lifecycleStatus === "ENCERRADO");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Planejamento"
        title="Projetos"
        actions={
          <Link href="/planejamento/novo" className="btn">
            Novo projeto
          </Link>
        }
      />

      {projects.length === 0 ? (
        <div className="card space-y-3 px-5 py-12 text-center">
          <p className="text-sm text-[var(--gray-500)]">
            Nenhum projeto no planejamento. Inicie um novo com a planilha homologada.
          </p>
          <Link href="/planejamento/novo" className="btn inline-flex">
            Começar projeto
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <ProjectSection
            title="Em andamento"
            empty="Nenhum projeto em andamento."
            projects={emAndamento}
          />
          <ProjectSection
            title="Encerrados"
            empty="Nenhum projeto encerrado."
            projects={encerrados}
            muted
          />
        </div>
      )}
    </div>
  );
}

function ProjectListCard({
  href,
  externalCode,
  name,
  jurisdiction,
  accountName,
  importedAt,
  importSource,
  situacao,
  totalApproved,
  totalAvailable,
  muted,
}: {
  href: string;
  externalCode: string;
  name: string | null;
  jurisdiction: string;
  accountName: string;
  importedAt: Date | null;
  importSource: string | null;
  situacao: string | null;
  totalApproved: number;
  totalAvailable: number;
  muted?: boolean;
}) {
  const meta = [
    jurisdictionLabel(jurisdiction),
    accountName,
    importedAt
      ? `planilha em ${formatDate(importedAt)}`
      : importSourceLabel(importSource),
  ].join(" · ");

  return (
    <Link
      href={href}
      className={`group card relative flex overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md ${
        muted
          ? "border-[var(--border)] bg-[var(--gray-50)] opacity-80 hover:opacity-100"
          : "hover:border-[#b8b0e8]"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${
          muted
            ? "bg-[var(--gray-300)]"
            : "bg-[linear-gradient(180deg,#6b4fc9_0%,#3b82d6_100%)]"
        }`}
        aria-hidden
      />
      {!muted ? (
        <span
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(107,79,201,0.07),transparent_55%)]"
          aria-hidden
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${
              muted
                ? "bg-[var(--gray-100)] text-[var(--gray-500)] ring-[var(--border)]"
                : "bg-[linear-gradient(135deg,#ebe9f8_0%,#ddd6fe_100%)] text-[#5b52c9] ring-[#d4cff0]"
            }`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 4h14v16H5V4Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M8 8h8M8 12h8M8 16h5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                className="opacity-70"
              />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide ${
                  muted
                    ? "bg-[var(--gray-200)] text-[var(--gray-600)]"
                    : "bg-[var(--navy-soft)] text-[var(--navy)]"
                }`}
              >
                {externalCode}
              </span>
              {situacao ? (
                <span className="max-w-[14rem] truncate rounded-lg bg-[var(--gray-100)] px-2.5 py-1 text-xs font-medium text-[var(--gray-600)]">
                  {situacao}
                </span>
              ) : null}
            </div>
            {name ? (
              <p
                className={`mt-2 truncate text-base font-semibold ${
                  muted ? "text-[var(--gray-500)]" : "text-[var(--navy)]"
                }`}
              >
                {name}
              </p>
            ) : null}
            <p className="mt-1 text-sm leading-relaxed text-[var(--gray-500)]">{meta}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:pl-2">
          <div className="flex flex-1 gap-2 sm:flex-none">
            <div className="min-w-[7.5rem] flex-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 sm:flex-none">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                Aprovado
              </p>
              <p
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  muted ? "text-[var(--gray-500)]" : "text-[var(--navy)]"
                }`}
              >
                {formatCurrency(totalApproved)}
              </p>
            </div>
            <div
              className={`min-w-[7.5rem] flex-1 rounded-xl px-3 py-2 sm:flex-none ${
                muted
                  ? "border border-[var(--border)] bg-[var(--gray-100)]"
                  : "border border-[#d4cff0] bg-[#ebe9f8]"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                Saldo
              </p>
              <p
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  muted ? "text-[var(--gray-500)]" : "text-[#5b52c9]"
                }`}
              >
                {formatCurrency(totalAvailable)}
              </p>
            </div>
          </div>

          <span
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
              muted
                ? "bg-[var(--gray-100)] text-[var(--gray-500)]"
                : "bg-[#ebe9f8] text-[#5b52c9] group-hover:bg-[linear-gradient(90deg,#6b4fc9_0%,#3b82d6_100%)] group-hover:text-white"
            }`}
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProjectSection({
  title,
  empty,
  projects,
  muted,
}: {
  title: string;
  empty: string;
  muted?: boolean;
  projects: Array<{
    id: string;
    externalCode: string;
    name: string | null;
    jurisdiction: string;
    importedAt: Date | null;
    importSource: string | null;
    lifecycleStatus: string;
    captadoRecebido: unknown;
    captadoTransferido: unknown;
    rendimentos: unknown;
    account: { name: string };
    project: { situacao: string | null; valorCaptado: unknown } | null;
    sheet: {
      lines: unknown[];
      totalApproved?: unknown;
    } | null;
    commitments: Array<{
      budgetLineId: string;
      amount: unknown;
      status: string;
    }>;
  }>;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className={`text-sm font-semibold uppercase tracking-[0.12em] ${
            muted ? "text-[var(--gray-400)]" : "text-[var(--navy)]"
          }`}
        >
          {title}
          <span className="ml-2 font-normal normal-case tracking-normal text-[var(--gray-400)]">
            ({projects.length})
          </span>
        </h2>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-[var(--gray-400)]">{empty}</p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const bal = p.sheet
              ? computeProjectBalance({
                  lines: p.sheet.lines as never,
                  commitments: p.commitments as never,
                  valorCaptado: money(p.project?.valorCaptado),
                  captadoRecebido: p.captadoRecebido,
                  captadoTransferido: p.captadoTransferido,
                  rendimentos: p.rendimentos,
                })
              : null;
            return (
              <ProjectListCard
                key={p.id}
                href={`/planejamento/${p.id}`}
                externalCode={p.externalCode}
                name={p.name}
                jurisdiction={p.jurisdiction}
                accountName={p.account.name}
                importedAt={p.importedAt}
                importSource={p.importSource}
                situacao={p.project?.situacao ?? null}
                totalApproved={bal?.totalApproved ?? 0}
                totalAvailable={bal?.totalAvailable ?? 0}
                muted={muted}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
