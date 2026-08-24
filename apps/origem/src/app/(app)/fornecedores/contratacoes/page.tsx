import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import {
  CATALOG_PAGE_SIZE,
  CatalogPager,
  catalogPageCount,
  parseCatalogPage,
} from "@/components/catalog/CatalogPager";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CatalogEngagementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const q = one(sp.q)?.trim() || "";
  const delayed = one(sp.delayed);
  const sort = one(sp.sort) || "recent";
  const minRating = one(sp.minRating) ? Number(one(sp.minRating)) : undefined;

  const where = {
    workspaceId: ws,
    ...(delayed === "1" ? { delayed: true } : delayed === "0" ? { delayed: false } : {}),
    ...(minRating ? { rating: { gte: minRating } } : {}),
    ...(q
      ? {
          OR: [
            { location: { contains: q, mode: "insensitive" as const } },
            { notes: { contains: q, mode: "insensitive" as const } },
            {
              service: {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { supplier: { name: { contains: q, mode: "insensitive" as const } } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const total = await prisma.catalogEngagement.count({ where });
  const pageCount = catalogPageCount(total);
  const page = parseCatalogPage(one(sp.page), pageCount);

  const engagements = await prisma.catalogEngagement.findMany({
    where,
    orderBy:
      sort === "price" ? { price: "desc" } : sort === "rating" ? { rating: "desc" } : { hiredAt: "desc" },
    skip: (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE,
    include: { service: { include: { supplier: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores › Contratações"
        title="Contratações"
        description="Histórico de preços, prazos e avaliações."
        actions={
          <Link href="/fornecedores/contratacoes/novo" className="btn">
            Nova contratação
          </Link>
        }
      />

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div className="field min-w-[12rem] flex-1">
          <label htmlFor="q">Busca</label>
          <input id="q" name="q" defaultValue={q} placeholder="Serviço, fornecedor ou local" />
        </div>
        <div className="field">
          <label htmlFor="delayed">Atraso</label>
          <select id="delayed" name="delayed" defaultValue={delayed || ""}>
            <option value="">Todos</option>
            <option value="1">Com atraso</option>
            <option value="0">Sem atraso</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="minRating">Avaliação mín.</label>
          <select id="minRating" name="minRating" defaultValue={one(sp.minRating) || ""}>
            <option value="">Qualquer</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Ordenar</label>
          <select id="sort" name="sort" defaultValue={sort}>
            <option value="recent">Mais recentes</option>
            <option value="price">Maior preço</option>
            <option value="rating">Melhor avaliação</option>
          </select>
        </div>
        <button type="submit" className="btn btn-ghost">
          Filtrar
        </button>
      </form>

      {total === 0 ? (
        <div className="card px-5 py-12 text-center text-sm text-[var(--gray-500)]">
          Nenhuma contratação encontrada.{" "}
          <Link href="/fornecedores/contratacoes/novo" className="font-semibold text-[var(--gold)] hover:underline">
            Registrar
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {engagements.map((e) => (
            <div key={e.id} className="card flex items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--navy)]">{e.service.name}</p>
                <p className="truncate text-sm text-[var(--gray-500)]">
                  <Link href={`/fornecedores/empresas/${e.service.supplierId}`} className="hover:underline">
                    {e.service.supplier.name}
                  </Link>
                  {" · "}
                  {formatDate(e.hiredAt)}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {e.salicPaymentId ? (
                  <span className="rounded-full bg-[var(--navy-soft)] px-3 py-1 text-xs font-semibold text-[var(--navy)]">
                    SALIC
                  </span>
                ) : null}
                {e.delayed ? (
                  <span className="text-xs font-semibold text-amber-700">Atraso</span>
                ) : null}
                <span className="font-semibold text-[var(--navy)]">{formatCurrency(Number(e.price))}</span>
                <CatalogStars value={e.rating} />
              </div>
            </div>
          ))}
          <CatalogPager
            page={page}
            pageCount={pageCount}
            total={total}
            params={{
              q: q || undefined,
              delayed: delayed || undefined,
              minRating: one(sp.minRating) || undefined,
              sort: sort !== "recent" ? sort : undefined,
            }}
          />
        </div>
      )}
    </div>
  );
}
