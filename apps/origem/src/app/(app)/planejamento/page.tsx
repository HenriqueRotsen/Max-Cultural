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
              <Link
                key={p.id}
                href={`/planejamento/${p.id}`}
                className={`card flex items-center justify-between gap-4 p-5 transition ${
                  muted
                    ? "border-[var(--border)] bg-[var(--gray-50)] opacity-75 hover:opacity-100"
                    : "hover:border-[#c5d0e4]"
                }`}
              >
                <div className="min-w-0">
                  <p
                    className={`truncate font-semibold ${
                      muted ? "text-[var(--gray-500)]" : "text-[var(--navy)]"
                    }`}
                  >
                    {p.externalCode}
                    {p.name ? ` — ${p.name}` : ""}
                  </p>
                  <p className="truncate text-sm text-[var(--gray-500)]">
                    {jurisdictionLabel(p.jurisdiction)} · {p.account.name}
                    {p.importedAt
                      ? ` · planilha em ${formatDate(p.importedAt)}`
                      : ` · ${importSourceLabel(p.importSource)}`}
                    {p.project?.situacao ? ` · ${p.project.situacao}` : ""}
                  </p>
                </div>
                <div
                  className={`shrink-0 text-right text-sm tabular-nums ${
                    muted ? "text-[var(--gray-400)]" : ""
                  }`}
                >
                  <p
                    className={`font-semibold ${
                      muted ? "text-[var(--gray-500)]" : "text-[var(--navy)]"
                    }`}
                  >
                    {formatCurrency(bal?.totalApproved ?? 0)}
                  </p>
                  <p className="text-xs text-[var(--gray-500)]">
                    saldo {formatCurrency(bal?.totalAvailable ?? 0)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
