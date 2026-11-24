import Link from "next/link";
import { getWorkspaceContext } from "@/lib/auth/session";
import { PageHeader, StatCard } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { loadReconciliation, type ProjectReconciliationRow } from "@/lib/reconciliation-data";
import { STAGE_LABEL, type ReconciliationStage } from "@/lib/reconciliation";
import { ReconciliationNotes } from "@/components/reconciliation/ReconciliationNotes";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STAGES: ReconciliationStage[] = ["encerrado", "execucao", "prestacao"];
const STAGE_HINT: Record<ReconciliationStage, string> = {
  encerrado: "Prestação aprovada ou arquivado: a conta deve fechar.",
  execucao: "Ainda pode gastar: pago abaixo do captado é esperado.",
  prestacao: "Prestou contas: o pago deveria bater com captado + rendimentos.",
};
const pctText = (n: number | null) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const severity = (r: ProjectReconciliationRow) =>
  r.notes.some((n) => n.level === "critical") ? 2 : r.notes.some((n) => n.level === "attention") ? 1 : 0;

/**
 * Auditoria › Captado × pago — quanto cada PRONAC pagou contra o que captou,
 * por fase, com duplicidades do SALIC e diferenças fora da curva.
 */
export default async function CaptadoPagoPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filtro = sp.filtro === "todos" ? "todos" : "avisos";
  const { entitlements } = await getWorkspaceContext();
  const rows = await loadReconciliation({ workspaceId: entitlements.workspaceId });

  const captado = rows.reduce((n, r) => n + r.captado, 0);
  const pago = rows.reduce((n, r) => n + r.pago, 0);
  const dupAmount = rows.reduce((n, r) => n + r.duplicateAmount, 0);
  const dupProjects = rows.filter((r) => r.duplicates.length).length;
  const foraDaCurva = rows.filter((r) => r.notes.some((n) => n.code === "ACIMA_FORA_DA_CURVA"));
  const byStage = STAGES.map((stage) => {
    const list = rows.filter((r) => r.stage === stage);
    return {
      stage,
      count: list.length,
      captado: list.reduce((n, r) => n + r.captado, 0),
      pago: list.reduce((n, r) => n + r.pago, 0),
      acima: list.reduce((n, r) => n + Math.max(r.diff, 0), 0),
      abaixo: list.reduce((n, r) => n + Math.min(r.diff, 0), 0),
    };
  });

  const shown = (filtro === "avisos" ? rows.filter((r) => severity(r) > 0) : rows).sort(
    (a, b) => severity(b) - severity(a) || Math.abs(b.diff) - Math.abs(a.diff),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Captado × pago"
        title="Captado × pago"
        description="Quanto cada PRONAC pagou contra o que captou, por fase do projeto, e o que não fecha: comprovantes lançados em duplicidade no SALIC e pagamentos acima do que rendimentos explicariam."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Captado" value={formatCurrency(captado)} hint={`${rows.length} projeto(s) com captação ou pagamento`} />
        <StatCard label="Pago" value={formatCurrency(pago)} hint={`Diferença: ${formatCurrency(pago - captado)}`} />
        <StatCard
          label="Fora da curva"
          value={String(foraDaCurva.length)}
          hint={
            foraDaCurva.length
              ? `Pagaram ${formatCurrency(foraDaCurva.reduce((n, r) => n + r.diff - r.duplicateAmount, 0))} acima do que rendimentos explicam`
              : "Nenhum pagamento acima do esperado"
          }
        />
        <StatCard
          label="Duplicidades no SALIC"
          value={formatCurrency(dupAmount)}
          hint={dupProjects ? `Em ${dupProjects} projeto(s)` : "Nenhum comprovante repetido"}
        />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h2 className="font-semibold text-[var(--navy)]">De onde vem a diferença</h2>
          <p className="mt-0.5 text-sm text-[var(--gray-600)]">
            A diferença total junta projetos que pagaram a mais e projetos que ainda têm saldo. Separada por fase:
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Fase</th>
                <th className="num">Projetos</th>
                <th className="num">Captado</th>
                <th className="num">Pago</th>
                <th className="num">Pago a mais</th>
                <th className="num">Pago a menos</th>
                <th className="num">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {byStage.map((g) => (
                <tr key={g.stage}>
                  <td>
                    <p className="font-medium text-[var(--navy)]">{STAGE_LABEL[g.stage]}</p>
                    <p className="text-xs text-[var(--gray-500)]">{STAGE_HINT[g.stage]}</p>
                  </td>
                  <td className="num">{g.count}</td>
                  <td className="num">{formatCurrency(g.captado)}</td>
                  <td className="num">{formatCurrency(g.pago)}</td>
                  <td className="num">{formatCurrency(g.acima)}</td>
                  <td className="num">{formatCurrency(g.abaixo)}</td>
                  <td className="num font-semibold">{formatCurrency(g.pago - g.captado)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="font-semibold">Total</td>
                <td className="num">{rows.length}</td>
                <td className="num">{formatCurrency(captado)}</td>
                <td className="num">{formatCurrency(pago)}</td>
                <td className="num">{formatCurrency(byStage.reduce((n, g) => n + g.acima, 0))}</td>
                <td className="num">{formatCurrency(byStage.reduce((n, g) => n + g.abaixo, 0))}</td>
                <td className="num font-semibold">{formatCurrency(pago - captado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h2 className="font-semibold text-[var(--navy)]">Projetos</h2>
          <nav className="accounts-tabs" aria-label="Filtro dos projetos">
            <Link href="/captado-pago" aria-current={filtro === "avisos" ? "page" : undefined}>
              Com avisos ({rows.filter((r) => severity(r) > 0).length})
            </Link>
            <Link href="/captado-pago?filtro=todos" aria-current={filtro === "todos" ? "page" : undefined}>
              Todos ({rows.length})
            </Link>
          </nav>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--gray-500)]">Nenhum projeto com aviso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th>Fase</th>
                  <th className="num">Captado</th>
                  <th className="num">Pago</th>
                  <th className="num">Diferença</th>
                  <th className="min-w-[18rem]">Avisos</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.projectId} className="align-top">
                    <td className="min-w-[12rem]">
                      <Link href={`/panorama/pronac/${r.pronac}`} className="font-medium text-[var(--navy)] hover:underline">
                        PRONAC {r.pronac}
                      </Link>
                      <p className="text-xs text-[var(--gray-500)]">{r.accountName}</p>
                      {r.situacao ? <p className="text-xs text-[var(--gray-400)]">{r.situacao}</p> : null}
                    </td>
                    <td className="whitespace-nowrap text-sm">{STAGE_LABEL[r.stage]}</td>
                    <td className="num">{formatCurrency(r.captado)}</td>
                    <td className="num">{formatCurrency(r.pago)}</td>
                    <td className="num">
                      <span className="font-semibold">{formatCurrency(r.diff)}</span>
                      <p className="text-xs text-[var(--gray-500)]">{pctText(r.pct)}</p>
                    </td>
                    <td>
                      <ReconciliationNotes r={r} compact />
                      {!r.notes.length ? <span className="text-sm text-[var(--gray-500)]">Bate</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-[var(--gray-500)]">
        O SALIC não mostra os rendimentos da conta do projeto nem transferências entre projetos. &ldquo;Fora da curva&rdquo; é
        quando o pago passa do captado mais do que 1% ao mês de rendimento, do primeiro aporte ao último pagamento,
        explicaria. Duplicidade é o mesmo comprovante (fornecedor, valor, documento, pagamento e linha do orçamento)
        lançado mais de uma vez.
      </p>
    </div>
  );
}
