import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { formatCgccpf } from "@/lib/format";
import { BRAZIL_UF } from "@/lib/catalog/address";
import { ensureCatalogSuppliersFromAudit } from "@/lib/catalog/from-audit";
import { PageHeader } from "@/components/ui";
import { CatalogStars } from "@/components/catalog/CatalogStars";
import { CatalogFavoriteButton } from "@/components/catalog/CatalogFavoriteButton";
import { CatalogPriceDollars } from "@/components/catalog/CatalogPriceDollars";
import {
  CATALOG_PAGE_SIZE,
  CatalogPager,
  catalogPageCount,
  parseCatalogPage,
} from "@/components/catalog/CatalogPager";
import { getYearTiersForSuppliers } from "@/lib/catalog/pricing-insights";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CatalogSuppliersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  await ensureCatalogSuppliersFromAudit(ws);

  const q = one(sp.q)?.trim() || "";
  const state = one(sp.state) || "";
  const minRating = one(sp.minRating) ? Number(one(sp.minRating)) : undefined;
  const sort = one(sp.sort) || "name";

  const cnpjDigits = q.replace(/\D/g, "");

  const where = {
    workspaceId: ws,
    ...(state ? { state } : {}),
    ...(minRating ? { avgRating: { gte: minRating } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { tradeName: { contains: q, mode: "insensitive" as const } },
            { city: { contains: q, mode: "insensitive" as const } },
            { notes: { contains: q, mode: "insensitive" as const } },
            {
              services: {
                some: {
                  OR: [
                    { name: { contains: q, mode: "insensitive" as const } },
                    { description: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              },
            },
            ...(cnpjDigits.length > 0
              ? [{ cnpj: { contains: cnpjDigits } }]
              : []),
          ],
        }
      : {}),
  };

  const total = await prisma.catalogSupplier.count({ where });
  const pageCount = catalogPageCount(total);
  const page = parseCatalogPage(one(sp.page), pageCount);

  const suppliers = await prisma.catalogSupplier.findMany({
    where,
    orderBy:
      sort === "rating"
        ? { avgRating: "desc" }
        : sort === "recent"
          ? { createdAt: "desc" }
          : { name: "asc" },
    skip: (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE,
    include: { _count: { select: { services: true } } },
  });

  const favoriteIds = new Set(
    (
      await prisma.catalogFavorite.findMany({
        where: { workspaceId: ws, supplierId: { in: suppliers.map((s) => s.id) } },
        select: { supplierId: true },
      })
    ).map((f) => f.supplierId),
  );

  const { suppliers: yearTiers } = await getYearTiersForSuppliers(
    ws,
    suppliers.map((s) => s.id),
  );

  const pagerParams = {
    q: q || undefined,
    state: state || undefined,
    minRating: one(sp.minRating) || undefined,
    sort: sort !== "name" ? sort : undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Fornecedores"
        title="Fornecedores"
        description="Cadastro único por CNPJ/CPF. Inclui automaticamente os fornecedores da Auditoria (SALIC), com serviços e preços dos comprovantes."
        actions={
          <Link href="/fornecedores/empresas/novo" className="btn">
            Novo fornecedor
          </Link>
        }
      />

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="field min-w-[12rem] flex-1">
          <label htmlFor="q">Busca</label>
          <input id="q" name="q" defaultValue={q} placeholder="Nome, cidade ou CNPJ/CPF" />
        </div>
        <div className="field">
          <label htmlFor="state">UF</label>
          <select id="state" name="state" defaultValue={state}>
            <option value="">Todas</option>
            {BRAZIL_UF.map((uf) => (
              <option key={uf.sigla} value={uf.sigla}>
                {uf.sigla}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="minRating">Avaliação mín.</label>
          <select id="minRating" name="minRating" defaultValue={one(sp.minRating) || ""}>
            <option value="">Qualquer</option>
            {[4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Ordenar</label>
          <select id="sort" name="sort" defaultValue={sort}>
            <option value="name">Nome</option>
            <option value="rating">Melhor avaliação</option>
            <option value="recent">Mais recentes</option>
          </select>
        </div>
        <button type="submit" className="btn btn-ghost">
          Filtrar
        </button>
      </form>

      {total === 0 ? (
        <div className="card px-5 py-12 text-center text-sm text-[var(--gray-500)]">
          Nenhum fornecedor encontrado.{" "}
          <Link href="/fornecedores/empresas/novo" className="font-semibold text-[var(--gold)] hover:underline">
            Cadastrar o primeiro
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s) => (
            <div key={s.id} className="card flex items-center justify-between gap-4 p-5">
              <Link href={`/fornecedores/empresas/${s.id}`} className="min-w-0 flex-1">
                <p className="inline-flex max-w-full items-baseline gap-1.5 truncate font-semibold text-[var(--navy)]">
                  <span className="truncate">{s.name}</span>
                  <CatalogPriceDollars
                    level={yearTiers.get(s.id)?.level ?? 2}
                    axes={yearTiers.get(s.id)?.axes}
                    size="sm"
                  />
                </p>
                <p className="truncate text-sm text-[var(--gray-500)]">
                  {formatCgccpf(s.cnpj)}
                  {s.city && s.state ? ` · ${s.city}/${s.state}` : ""}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                {s.fromAudit ? (
                  <span className="rounded-full bg-[var(--navy-soft)] px-3 py-1 text-xs font-semibold text-[var(--navy)]">
                    Auditoria
                  </span>
                ) : null}
                <CatalogFavoriteButton supplierId={s.id} favorited={favoriteIds.has(s.id)} />
                <span className="rounded-full bg-[var(--gray-50)] px-3 py-1 text-xs text-[var(--gray-600)]">
                  {s._count.services} {s._count.services === 1 ? "serviço" : "serviços"}
                </span>
                <CatalogStars value={s.avgRating} count={s.ratingCount} />
              </div>
            </div>
          ))}
          <CatalogPager page={page} pageCount={pageCount} total={total} params={pagerParams} />
        </div>
      )}
    </div>
  );
}
