import Link from "next/link";
import { removeWatchedSupplier } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { FieldHelp } from "@/components/FieldHelp";
import { PageHeader } from "@/components/ui";
import { AddWatchedSupplierForm } from "@/components/AddWatchedSupplierForm";
import { SyncedSuppliersTable } from "@/components/SyncedSuppliersTable";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { RelationBondByRulesetPanel } from "@/components/RelationBondByRulesetPanel";
import { formatCgccpf } from "@/lib/format";
import { HELP } from "@/lib/help";
import { RULESET_CATALOG, type RelationKind } from "@/lib/compliance/defaults";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const { demoProjectWhere } = await import("@/lib/demo");
  const demoProjects = await demoProjectWhere(ws);
  const projectScope = { salicAccount: { workspaceId: ws }, ...demoProjects };

  const [watched, suppliers, paymentAggs] = await Promise.all([
    prisma.watchedSupplier.findMany({
      where: { workspaceId: ws },
      orderBy: { createdAt: "desc" },
      include: { supplier: true },
    }),
    prisma.supplier.findMany({
      where: {
        payments: { some: { project: projectScope } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.payment.groupBy({
      by: ["supplierId"],
      where: { project: projectScope },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const bondRows = RULESET_CATALOG.map((item) => ({
    version: item.version,
    sourceCode: item.sourceCode,
    sourceUrl: item.sourceUrl,
    catalogRelations: [
      ...item.caps.relationRules.countsTowardProponentCap,
    ] as RelationKind[],
    notes: item.caps.relationRules.notes || null,
  }));

  const aggBySupplier = new Map(
    paymentAggs.map((a) => [
      a.supplierId,
      { total: Number(a._sum.amount || 0), payments: a._count._all },
    ]),
  );

  const supplierRows = suppliers.map((s) => {
    const agg = aggBySupplier.get(s.id);
    return {
      id: s.id,
      name: s.name,
      cgccpf: s.cgccpf,
      payments: agg?.payments ?? 0,
      total: agg?.total ?? 0,
    };
  });

  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const tab =
    tabParam === "adicionar" ||
    tabParam === "todos" ||
    tabParam === "observados" ||
    tabParam === "vinculos"
      ? tabParam
      : watched.length > 0
        ? "observados"
        : "adicionar";

  const added = sp.added === "1";

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Início › Fornecedores"
        title="Fornecedores"
        description="Separe quem você acompanha de perto da lista completa já carregada no Salink."
      />

      <nav className="accounts-tabs" aria-label="Abas de fornecedores">
        <Link
          href="/fornecedores?tab=observados"
          className={tab === "observados" ? "is-active" : undefined}
        >
          Observados{watched.length > 0 ? ` (${watched.length})` : ""}
        </Link>
        <Link
          href="/fornecedores?tab=adicionar"
          className={tab === "adicionar" ? "is-active" : undefined}
        >
          Adicionar
        </Link>
        <Link
          href="/fornecedores?tab=todos"
          className={tab === "todos" ? "is-active" : undefined}
        >
          Todos no Salink{supplierRows.length > 0 ? ` (${supplierRows.length})` : ""}
        </Link>
        <Link
          href="/fornecedores?tab=vinculos"
          className={tab === "vinculos" ? "is-active" : undefined}
        >
          Vínculos por IN
        </Link>
      </nav>

      {added ? (
        <div className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]">
          Observado adicionado. Ative o vínculo no detalhe do PRONAC, se couber.
        </div>
      ) : null}

      {tab === "observados" && (
        <section className="card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--navy)]">
              Observados
              <FieldHelp text={HELP.watchedOnly} />
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-500)]">
              Lista de acompanhamento. O vínculo art. 23 liga/desliga no detalhe
              de cada PRONAC (vale para o proponente + IN daquele projeto).
            </p>
          </div>

          <div className="space-y-4 p-5">
            {watched.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
                <p className="text-sm text-[var(--gray-500)]">
                  Nenhum fornecedor observado ainda.
                </p>
                <Link href="/fornecedores?tab=adicionar" className="btn mt-4 inline-flex">
                  Adicionar observado
                </Link>
              </div>
            ) : (
              watched.map((w) => {
                const digits =
                  (w.cgccpf || w.supplier?.cgccpf || "").replace(/\D/g, "") ||
                  null;
                const partyName =
                  w.nameQuery || w.supplier?.name || w.label || digits || "Observado";

                return (
                  <article
                    key={w.id}
                    className="rounded-xl border border-[var(--border)] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-[var(--navy)]">
                          {w.label || partyName}
                        </h3>
                        <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                          {formatCgccpf(w.cgccpf || w.supplier?.cgccpf)}
                          {(w.nameQuery || w.supplier?.name) &&
                          (w.label || "") !== (w.nameQuery || w.supplier?.name) ? (
                            <>
                              <span className="mx-1.5 text-[var(--gray-300)]">·</span>
                              {w.nameQuery || w.supplier?.name}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <form action={removeWatchedSupplier.bind(null, w.id)}>
                        <ConfirmSubmitButton
                          className="btn btn-ghost"
                          message="Remover este fornecedor da lista de observados?"
                        >
                          Remover
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}

      {tab === "adicionar" && <AddWatchedSupplierForm />}

      {tab === "todos" && (
        <section className="card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Todos no Salink
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-500)]">
              Fornecedores que já apareceram nos pagamentos carregados. Esta lista não é a de
              observação — use a aba Observados para acompanhar alguém de perto.
            </p>
          </div>
          <div className="p-5">
            <SyncedSuppliersTable suppliers={supplierRows} />
          </div>
        </section>
      )}

      {tab === "vinculos" && (
        <section className="card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Vínculos por IN
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-500)]">
              Relacionamentos previstos em cada texto legal. O on/off por observado
              fica no detalhe do PRONAC.
            </p>
          </div>
          <div className="p-5">
            <RelationBondByRulesetPanel rows={bondRows} />
          </div>
        </section>
      )}
    </div>
  );
}
