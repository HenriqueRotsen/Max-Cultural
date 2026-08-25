import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import {
  getCategoryLabel,
  SERVICE_CATEGORIES,
} from "@/lib/catalog/categories";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { computeProjectBalance } from "@/lib/planning/rubric-balance";

export const dynamic = "force-dynamic";

export default async function BuscarSaldoPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category = "", q = "" } = await searchParams;
  const { entitlements } = await getWorkspaceContext();

  const projects = await prisma.planningProject.findMany({
    where: {
      workspaceId: entitlements.workspaceId,
      importedAt: { not: null },
    },
    include: {
      account: { select: { name: true } },
      sheet: { include: { lines: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
    },
  });

  const hits: Array<{
    projectId: string;
    code: string;
    account: string;
    itemName: string;
    stageName: string;
    available: number;
    categoryHint: string | null;
  }> = [];

  for (const p of projects) {
    if (!p.sheet) continue;
    const bal = computeProjectBalance({
      lines: p.sheet.lines,
      commitments: p.commitments,
    });
    for (const line of p.sheet.lines) {
      const b = bal.lines.get(line.id);
      if (!b || b.available <= 0) continue;
      if (category && line.categoryHint !== category) continue;
      if (q && !line.itemName.toLowerCase().includes(q.toLowerCase())) continue;
      hits.push({
        projectId: p.id,
        code: p.externalCode,
        account: p.account.name,
        itemName: line.itemName,
        stageName: line.stageName,
        available: b.available,
        categoryHint: line.categoryHint,
      });
    }
  }

  hits.sort((a, b) => b.available - a.available);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> / Buscar
          </>
        }
        title="Rubricas com saldo"
        description="Encontre rapidamente projetos com orçamento disponível por categoria."
      />

      <form className="card flex flex-wrap items-end gap-3 p-5">
        <label className="field min-w-[12rem]">
          <span>Categoria</span>
          <select name="category" defaultValue={category} className="w-full">
            <option value="">Todas</option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field min-w-[14rem] flex-1">
          <span>Buscar item</span>
          <input name="q" defaultValue={q} placeholder="Ex.: Serviços de TI" className="w-full" />
        </label>
        <button type="submit" className="btn">
          Filtrar
        </button>
      </form>

      {hits.length === 0 ? (
        <p className="text-sm text-[var(--gray-500)]">Nenhuma rubrica com saldo para este filtro.</p>
      ) : (
        <div className="space-y-2">
          {hits.map((h, i) => (
            <Link
              key={`${h.projectId}-${i}`}
              href={`/planejamento/${h.projectId}`}
              className="card flex items-center justify-between gap-3 p-4 transition hover:border-[#c5d0e4]"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--navy)]">
                  {h.code} · {h.itemName}
                </p>
                <p className="truncate text-sm text-[var(--gray-500)]">
                  {h.account} · {h.stageName}
                  {h.categoryHint ? ` · ${getCategoryLabel(h.categoryHint)}` : ""}
                </p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums text-[var(--navy)]">
                {formatCurrency(h.available)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
