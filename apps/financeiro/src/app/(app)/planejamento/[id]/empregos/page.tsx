import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { JobCityForm, JobsReportActions } from "@/components/planning/JobsReportTools";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCgccpf, formatCurrency } from "@/lib/format";
import { jobsReportCsv } from "@/lib/planning/jobs-report";
import { loadJobsReport } from "@/lib/planning/jobs-report-db";

export const dynamic = "force-dynamic";

const KIND_LABEL = { PF: "Pessoa física", MEI: "MEI", PJ: "Empresa" } as const;

export default async function EmpregosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pagos?: string }>;
}) {
  const { id } = await params;
  const onlyPaid = (await searchParams).pagos === "1";
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true, name: true },
  });
  if (!project) notFound();
  const report = await loadJobsReport(project.id, entitlements.workspaceId, { onlyPaid });
  const { totals } = report;
  const missingCnpj = report.missing.filter((p) => p.doc.length === 14).length;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${project.id}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${project.id}`}>{project.externalCode}</Link> / Empregos
            gerados
          </>
        }
        title="Empregos gerados"
        description={`${project.externalCode} · ${project.name}. Cada pessoa ou empresa contratada conta uma vez, na cidade do cadastro dela.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg border border-[var(--border)] bg-white p-1 text-sm print:hidden">
          <Link
            href={`/planejamento/${project.id}/empregos`}
            className={`rounded-md px-3 py-1.5 ${!onlyPaid ? "bg-[var(--navy)] !text-white" : "text-[var(--navy)]"}`}
          >
            Contratados (reservados e pagos)
          </Link>
          <Link
            href={`/planejamento/${project.id}/empregos?pagos=1`}
            className={`rounded-md px-3 py-1.5 ${onlyPaid ? "bg-[var(--navy)] !text-white" : "text-[var(--navy)]"}`}
          >
            Só pagos
          </Link>
        </nav>
        <JobsReportActions
          projectId={project.id}
          csv={jobsReportCsv(report)}
          filename={`empregos-gerados-${project.externalCode}${onlyPaid ? "-pagos" : ""}.csv`}
          missingCnpj={missingCnpj}
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total", totals.total],
          ["Pessoas físicas", totals.pf],
          ["MEI", totals.mei],
          ["Empresas", totals.pj],
        ].map(([label, n]) => (
          <div key={label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-500)]">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--navy)]">{n}</p>
          </div>
        ))}
      </section>

      {totals.total === 0 ? (
        <div className="card p-5 text-sm text-[var(--gray-500)]">
          {onlyPaid ? "Nenhum pagamento neste projeto ainda." : "Nenhuma contratação neste projeto ainda."}
        </div>
      ) : null}

      {report.states.length > 0 ? (
        <section className="card overflow-hidden">
          <h2 className="border-b border-[var(--border)] px-5 py-3 font-semibold text-[var(--navy)]">
            Por estado e cidade
          </h2>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>UF / cidade</th>
                  <th className="text-right">Pessoas físicas</th>
                  <th className="text-right">MEI</th>
                  <th className="text-right">Empresas</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {report.states.flatMap((st) => [
                  <tr key={st.state} className="bg-[var(--navy-soft)]/60 font-semibold">
                    <td>{st.state}</td>
                    <td className="text-right tabular-nums">{st.pf}</td>
                    <td className="text-right tabular-nums">{st.mei}</td>
                    <td className="text-right tabular-nums">{st.pj}</td>
                    <td className="text-right tabular-nums">{st.total}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(st.amount)}</td>
                  </tr>,
                  ...st.cities.map((ct) => (
                    <tr key={`${st.state}-${ct.city}`}>
                      <td className="pl-8">{ct.city}</td>
                      <td className="text-right tabular-nums">{ct.pf}</td>
                      <td className="text-right tabular-nums">{ct.mei}</td>
                      <td className="text-right tabular-nums">{ct.pj}</td>
                      <td className="text-right tabular-nums">{ct.total}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(ct.amount)}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {report.missing.length > 0 ? (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="font-semibold text-[var(--navy)]">
              Sem cidade no cadastro <span className="text-[var(--gray-400)]">· {report.missing.length}</span>
            </h2>
            <p className="text-sm text-[var(--gray-500)]">
              Ainda não entram na contagem por cidade.{" "}
              {missingCnpj > 0 ? "Os CNPJs podem ser buscados na Receita (botão acima); " : ""}
              os CPFs precisam da cidade e da UF preenchidas aqui.
            </p>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {report.missing.map((p) => (
              <li key={p.doc} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-[var(--navy)]">{p.name}</p>
                  <p className="text-xs text-[var(--gray-500)]">
                    {formatCgccpf(p.doc)} · {KIND_LABEL[p.kind]} · {formatCurrency(p.amount)}
                  </p>
                </div>
                <JobCityForm projectId={project.id} doc={p.doc} name={p.name} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.states.length > 0 ? (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold text-[var(--navy)]">
            Lista de contratados por cidade
          </summary>
          <div className="mt-3 space-y-4">
            {report.states.flatMap((st) =>
              st.cities.map((ct) => (
                <div key={`${st.state}-${ct.city}`}>
                  <p className="text-sm font-semibold text-[var(--navy)]">
                    {ct.city} / {st.state}
                  </p>
                  <ul className="mt-1 text-sm text-[var(--gray-600)]">
                    {ct.people.map((p) => (
                      <li key={p.doc}>
                        {p.name} · {formatCgccpf(p.doc)} · {KIND_LABEL[p.kind]}
                      </li>
                    ))}
                  </ul>
                </div>
              )),
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
