import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format";
import {
  CATALOG_PAGE_SIZE,
  CatalogPager,
  catalogPageCount,
  parseCatalogPage,
} from "@/components/catalog/CatalogPager";
import { CatalogPriceDollars } from "@/components/catalog/CatalogPriceDollars";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { PageBackLink, PageHeader } from "@/components/ui";
import { getCategoryLabel, isServiceCategory, SERVICE_CATEGORIES } from "@/lib/catalog/categories";
import { getYearTiersForSuppliers } from "@/lib/catalog/pricing-insights";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CatalogServicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const q = one(sp.q)?.trim() || "";
  const categoryRaw = one(sp.category) || "";
  const category = categoryRaw && isServiceCategory(categoryRaw) ? categoryRaw : "";
  const sort = one(sp.sort) || "name";
  const maxPrice = one(sp.maxPrice) ? Number(one(sp.maxPrice)) : undefined;

  const where = {
    supplier: { workspaceId: ws },
    ...(category ? { category } : {}),
    ...(maxPrice ? { avgPrice: { lte: maxPrice } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { supplier: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const total = await prisma.catalogService.count({ where });
  const pageCount = catalogPageCount(total);
  const page = parseCatalogPage(one(sp.page), pageCount);

  const services = await prisma.catalogService.findMany({
    where,
    orderBy:
      sort === "price"
        ? { avgPrice: "asc" }
        : sort === "rating"
          ? { avgRating: "desc" }
          : { name: "asc" },
    skip: (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE,
    include: {
      supplier: true,
      _count: { select: { engagements: true } },
    },
  });

  const { services: yearTiers } = await getYearTiersForSuppliers(ws, [
    ...new Set(services.map((s) => s.supplierId)),
  ]);

  return (
    <div className="space-y-6">
      <PageBackLink href="/fornecedores" label="Voltar ao banco de preços" />
      <PageHeader
        breadcrumb="Fornecedores › Serviços"
        title="Serviços"
        description="Sempre atrelados a um fornecedor, com preço médio das contratações."
        actions={
          <Link href="/fornecedores/servicos/novo" className="btn">
            Novo serviço
          </Link>
        }
      />

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div className="field min-w-[12rem] flex-1">
          <label htmlFor="q">Busca</label>
          <input id="q" name="q" defaultValue={q} placeholder="Serviço ou fornecedor" />
        </div>
        <div className="field">
          <label htmlFor="category">Categoria</label>
          <select id="category" name="category" defaultValue={category}>
            <option value="">Todas</option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="maxPrice">Preço máx.</label>
          <input id="maxPrice" name="maxPrice" defaultValue={one(sp.maxPrice) || ""} placeholder="R$" />
        </div>
        <div className="field">
          <label htmlFor="sort">Ordenar</label>
          <select id="sort" name="sort" defaultValue={sort}>
            <option value="name">Nome</option>
            <option value="price">Menor preço médio</option>
            <option value="rating">Melhor avaliação</option>
          </select>
        </div>
        <button type="submit" className="btn btn-ghost">
          Filtrar
        </button>
      </form>

      {total === 0 ? (
        <div className="card px-5 py-12 text-center text-sm text-[var(--gray-500)]">
          Nenhum serviço encontrado.{" "}
          <Link href="/fornecedores/servicos/novo" className="font-semibold text-[var(--gold)] hover:underline">
            Cadastrar
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/fornecedores/servicos/${s.id}`}
              className="card flex items-center justify-between gap-4 p-5 transition hover:border-[#c5d0e4]"
            >
              <div className="min-w-0">
                <p className="inline-flex max-w-full items-baseline gap-1.5 truncate font-semibold text-[var(--navy)]">
                  <span className="truncate">{s.name}</span>
                  <CatalogPriceDollars
                    level={yearTiers.get(s.id)?.level ?? 2}
                    axes={yearTiers.get(s.id)?.axes}
                    size="sm"
                  />
                </p>
                <p className="truncate text-sm text-[var(--gray-500)]">
                  {s.supplier.name}
                  {s.category ? ` · ${getCategoryLabel(s.category)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <span className="rounded-full bg-[var(--gray-50)] px-3 py-1 text-xs text-[var(--gray-600)]">
                  {s._count.engagements}x
                </span>
                <span className="font-semibold text-[var(--navy)]">{formatCurrency(s.avgPrice)}</span>
                <CatalogStars value={s.avgRating} />
              </div>
            </Link>
          ))}
          <CatalogPager
            page={page}
            pageCount={pageCount}
            total={total}
            params={{
              q: q || undefined,
              category: category || undefined,
              maxPrice: one(sp.maxPrice) || undefined,
              sort: sort !== "name" ? sort : undefined,
            }}
          />
        </div>
      )}
    </div>
  );
}
