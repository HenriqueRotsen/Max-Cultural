import Link from "next/link";
import {
  CatalogPager,
  CATALOG_PAGE_SIZE,
  catalogPageCount,
  parseCatalogPage,
} from "@/components/catalog/CatalogPager";
import { CnaeRecommendFields } from "@/components/planning/CnaeRecommendFields";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import {
  formatCnaeInput,
  normalizeCnaeCode,
} from "@/lib/catalog/cnae";
import {
  getCategoryLabel,
  SERVICE_CATEGORIES,
} from "@/lib/catalog/categories";
import { prisma } from "@/lib/db";
import { formatCurrency, parseBrMoney } from "@/lib/format";
import { computeProjectBalance } from "@/lib/planning/rubric-balance";
import { scoreRubricAgainstText } from "@/lib/planning/recommend-rubric";

export const dynamic = "force-dynamic";

const PAGE_SIZE = CATALOG_PAGE_SIZE;

type SortKey =
  | "code"
  | "account"
  | "itemName"
  | "stageName"
  | "category"
  | "available"
  | "score";

const SORT_KEYS = new Set<SortKey>([
  "code",
  "account",
  "itemName",
  "stageName",
  "category",
  "available",
  "score",
]);

function parseSort(raw: string | undefined): SortKey {
  if (raw && SORT_KEYS.has(raw as SortKey)) return raw as SortKey;
  return "available";
}

function parseDir(raw: string | undefined): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

function buildQuery(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function SortHeader({
  label,
  column,
  currentSort,
  currentDir,
  base,
  align = "left",
}: {
  label: string;
  column: SortKey;
  currentSort: SortKey;
  currentDir: "asc" | "desc";
  base: Record<string, string | undefined>;
  align?: "left" | "right";
}) {
  const active = currentSort === column;
  const nextDir = active && currentDir === "desc" ? "asc" : "desc";
  const href = `/planejamento/buscar${buildQuery({
    ...base,
    sort: column,
    dir: nextDir,
  })}`;
  const arrow = active ? (currentDir === "asc" ? "↑" : "↓") : "↕";

  return (
    <th className={align === "right" ? "text-right" : "text-left"}>
      <Link
        href={href}
        className={`inline-flex items-center gap-1 hover:text-[var(--navy)] ${
          active ? "text-[var(--navy)]" : "text-[var(--gray-400)]"
        }`}
      >
        {label}
        <span className="text-[0.65rem] tabular-nums opacity-70">{arrow}</span>
      </Link>
    </th>
  );
}

export default async function BuscarSaldoPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    q?: string;
    accountId?: string;
    min?: string;
    max?: string;
    cnae?: string;
    cnaeDesc?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const category = sp.category || "";
  const q = sp.q || "";
  const accountId = sp.accountId || "";
  const minRaw = sp.min || "";
  const maxRaw = sp.max || "";
  const cnaeRaw = sp.cnae || "";
  const cnaeDescRaw = sp.cnaeDesc || "";
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir);
  const minVal = parseBrMoney(minRaw);
  const maxVal = parseBrMoney(maxRaw);
  const cnaeCode = normalizeCnaeCode(cnaeRaw);

  const { entitlements } = await getWorkspaceContext();

  const [projects, accounts, cnaeFromCatalog] = await Promise.all([
    prisma.planningProject.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        importedAt: { not: null },
        ...(accountId ? { accountId } : {}),
      },
      include: {
        account: { select: { id: true, name: true } },
        project: { select: { valorCaptado: true } },
        sheet: { include: { lines: true } },
        commitments: {
          where: { status: { in: ["RESERVED", "PAID"] } },
          select: { budgetLineId: true, amount: true, status: true },
        },
      },
    }),
    prisma.salicAccount.findMany({
      where: { workspaceId: entitlements.workspaceId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    cnaeCode
      ? prisma.catalogSupplier.findFirst({
          where: {
            workspaceId: entitlements.workspaceId,
            cnaeCode,
            cnaeDescription: { not: null },
          },
          select: { cnaeDescription: true },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  const cnaeDescription =
    cnaeDescRaw.trim() || cnaeFromCatalog?.cnaeDescription || "";
  const recommendText = [cnaeDescription, cnaeCode ? `CNAE ${cnaeCode}` : ""]
    .filter(Boolean)
    .join(" ");
  const recommendOn = Boolean(recommendText.trim());

  type Hit = {
    projectId: string;
    lineId: string;
    code: string;
    account: string;
    itemName: string;
    stageName: string;
    productName: string;
    available: number;
    categoryHint: string | null;
    score: number;
    reasons: string[];
  };

  const hits: Hit[] = [];

  for (const p of projects) {
    if (!p.sheet) continue;
    const bal = computeProjectBalance({
      lines: p.sheet.lines,
      commitments: p.commitments,
      valorCaptado: p.project?.valorCaptado,
      captadoRecebido: p.captadoRecebido,
      captadoTransferido: p.captadoTransferido,
      rendimentos: p.rendimentos,
    });
    for (const line of p.sheet.lines) {
      const b = bal.lines.get(line.id);
      if (!b || b.available <= 0) continue;
      if (category && line.categoryHint !== category) continue;
      if (q && !line.itemName.toLowerCase().includes(q.toLowerCase())) continue;
      if (minVal != null && b.available + 0.009 < minVal) continue;
      if (maxVal != null && b.available - 0.009 > maxVal) continue;

      const scored = recommendOn
        ? scoreRubricAgainstText(
            {
              itemName: line.itemName,
              stageName: line.stageName,
              productName: line.productName,
              categoryHint: line.categoryHint,
              available: b.available,
            },
            recommendText,
          )
        : { score: 0, reasons: [] as string[] };

      hits.push({
        projectId: p.id,
        lineId: line.id,
        code: p.externalCode,
        account: p.account.name,
        itemName: line.itemName,
        stageName: line.stageName,
        productName: line.productName,
        available: b.available,
        categoryHint: line.categoryHint,
        score: scored.score,
        reasons: scored.reasons,
      });
    }
  }

  const effectiveSort: SortKey =
    sort === "available" && recommendOn && !sp.sort ? "score" : sort;

  const mul = dir === "asc" ? 1 : -1;
  hits.sort((a, b) => {
    let cmp = 0;
    switch (effectiveSort) {
      case "code":
        cmp = a.code.localeCompare(b.code, "pt-BR");
        break;
      case "account":
        cmp = a.account.localeCompare(b.account, "pt-BR");
        break;
      case "itemName":
        cmp = a.itemName.localeCompare(b.itemName, "pt-BR");
        break;
      case "stageName":
        cmp = a.stageName.localeCompare(b.stageName, "pt-BR");
        break;
      case "category":
        cmp = (a.categoryHint || "").localeCompare(b.categoryHint || "", "pt-BR");
        break;
      case "score":
        cmp = a.score - b.score;
        break;
      case "available":
      default:
        cmp = a.available - b.available;
        break;
    }
    if (cmp !== 0) return cmp * mul;
    return b.available - a.available;
  });

  const filterBase: Record<string, string | undefined> = {
    category: category || undefined,
    q: q || undefined,
    accountId: accountId || undefined,
    min: minRaw || undefined,
    max: maxRaw || undefined,
    cnae: cnaeRaw || undefined,
    cnaeDesc: cnaeDescRaw || undefined,
    sort: sp.sort || undefined,
    dir: sp.dir || undefined,
  };

  const total = hits.length;
  const pageCount = catalogPageCount(total, PAGE_SIZE);
  const page = parseCatalogPage(sp.page, pageCount);
  const pageHits = hits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const topScore = recommendOn ? Math.max(0, ...hits.map((h) => h.score)) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> / Buscar
          </>
        }
        title="Rubricas com saldo"
        description="Filtre por proponente, faixa de valor ou CNAE para achar onde encaixar o gasto."
      />

      <form className="card overflow-hidden">
        <div
          className="border-b border-[var(--border)] px-5 py-4"
          style={{
            background:
              "linear-gradient(135deg, var(--navy-soft) 0%, #fff 55%, var(--gold-soft) 100%)",
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
            Filtros
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--navy)]">
            Encontre a rubrica certa
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            Combine proponente, valor e CNAE para priorizar onde alocar o gasto.
          </p>
        </div>

        <div className="space-y-5 p-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--navy-soft)] text-xs font-bold text-[var(--navy)]">
                1
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--navy)]">Escopo</h3>
                <p className="text-xs text-[var(--gray-400)]">
                  Proponente, categoria e texto da rubrica
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="field">
                <span>Proponente</span>
                <select name="accountId" defaultValue={accountId} className="w-full">
                  <option value="">Todos</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
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
              <label className="field sm:col-span-2 lg:col-span-1">
                <span>Buscar item</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Ex.: Serviços de TI"
                  className="w-full"
                />
              </label>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--gray-50)] p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--gold-soft)] text-xs font-bold text-[var(--navy)]">
                2
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--navy)]">Faixa de saldo</h3>
                <p className="text-xs text-[var(--gray-400)]">
                  Valores disponíveis na rubrica (R$)
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">
                <span>Saldo mínimo</span>
                <input
                  name="min"
                  defaultValue={minRaw}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="w-full"
                />
              </label>
              <label className="field">
                <span>Saldo máximo</span>
                <input
                  name="max"
                  defaultValue={maxRaw}
                  placeholder="sem limite"
                  inputMode="decimal"
                  className="w-full"
                />
              </label>
            </div>
          </section>

          <section
            className="space-y-3 rounded-2xl border p-4"
            style={{
              borderColor: "#c4b5fd55",
              background:
                "linear-gradient(165deg, var(--navy-soft) 0%, #fff 70%)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--navy)] text-xs font-bold text-white">
                3
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--navy)]">
                  Recomendar por CNAE
                </h3>
                <p className="text-xs text-[var(--gray-400)]">
                  A descrição preenche sozinha; usamos isso para ranquear aderência
                </p>
              </div>
            </div>
            <CnaeRecommendFields
              initialCnae={cnaeRaw}
              initialDescription={
                cnaeDescRaw || cnaeFromCatalog?.cnaeDescription || ""
              }
            />
            {recommendOn ? (
              <p className="rounded-xl bg-white/80 px-3 py-2 text-xs text-[var(--gray-600)] ring-1 ring-[var(--border)]">
                Recomendação ativa com{" "}
                <span className="font-semibold text-[var(--navy)]">
                  {cnaeDescription || formatCnaeInput(cnaeCode) || cnaeRaw}
                </span>
                {cnaeFromCatalog?.cnaeDescription && !cnaeDescRaw.trim()
                  ? " (catálogo)"
                  : ""}
                . Sem outra ordenação, a lista prioriza aderência.
              </p>
            ) : (
              <p className="text-xs text-[var(--gray-400)]">
                Digite um CNAE completo (ex.: 6201-5/01) para ativar a recomendação.
              </p>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            {accountId || category || q || minRaw || maxRaw || cnaeRaw || cnaeDescRaw ? (
              <Link
                href="/planejamento/buscar"
                className="text-sm font-medium text-[var(--gray-500)] hover:text-[var(--navy)]"
              >
                Limpar filtros
              </Link>
            ) : (
              <span />
            )}
            <button type="submit" className="btn min-w-[10rem]">
              {recommendOn ? "Filtrar e recomendar" : "Aplicar filtros"}
            </button>
          </div>
        </div>
      </form>

      {total === 0 ? (
        <p className="text-sm text-[var(--gray-500)]">
          Nenhuma rubrica com saldo para este filtro.
        </p>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--gray-50)] px-5 py-3">
            <p className="text-sm text-[var(--gray-600)]">
              <span className="font-semibold text-[var(--navy)]">{total}</span>{" "}
              {total === 1 ? "rubrica com saldo" : "rubricas com saldo"}
              {pageCount > 1 ? (
                <span className="text-[var(--gray-400)]">
                  {" "}
                  · página {page} de {pageCount}
                </span>
              ) : null}
            </p>
          </div>
          <div className="table-wrap px-2 sm:px-3">
            <table className="data">
              <thead>
                <tr>
                  <SortHeader
                    label="Projeto"
                    column="code"
                    currentSort={effectiveSort}
                    currentDir={dir}
                    base={filterBase}
                  />
                  <SortHeader
                    label="Proponente"
                    column="account"
                    currentSort={effectiveSort}
                    currentDir={dir}
                    base={filterBase}
                  />
                  <SortHeader
                    label="Rubrica"
                    column="itemName"
                    currentSort={effectiveSort}
                    currentDir={dir}
                    base={filterBase}
                  />
                  <SortHeader
                    label="Etapa"
                    column="stageName"
                    currentSort={effectiveSort}
                    currentDir={dir}
                    base={filterBase}
                  />
                  <SortHeader
                    label="Categoria"
                    column="category"
                    currentSort={effectiveSort}
                    currentDir={dir}
                    base={filterBase}
                  />
                  {recommendOn ? (
                    <SortHeader
                      label="Aderência"
                      column="score"
                      currentSort={effectiveSort}
                      currentDir={dir}
                      base={filterBase}
                      align="right"
                    />
                  ) : null}
                  <SortHeader
                    label="Saldo"
                    column="available"
                    currentSort={effectiveSort}
                    currentDir={dir}
                    base={filterBase}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {pageHits.map((h) => {
                  const recommended =
                    recommendOn &&
                    topScore > 0 &&
                    h.score >= Math.max(8, topScore * 0.75);
                  return (
                    <tr
                      key={`${h.projectId}-${h.lineId}`}
                      className={recommended ? "bg-[var(--navy-soft)]/40" : undefined}
                    >
                      <td className="whitespace-nowrap">
                        <Link
                          href={`/planejamento/${h.projectId}`}
                          className="font-semibold text-[var(--gold)] hover:underline"
                        >
                          {h.code}
                        </Link>
                      </td>
                      <td className="max-w-[12rem] text-sm text-[var(--gray-600)]">
                        <span className="line-clamp-2">{h.account}</span>
                      </td>
                      <td className="min-w-[14rem] max-w-[22rem]">
                        <p className="font-medium text-[var(--navy)]">{h.itemName}</p>
                        {recommended ? (
                          <p className="mt-1 text-xs text-[var(--gold)]">
                            Recomendada
                            {h.reasons[0] ? ` · ${h.reasons[0]}` : ""}
                          </p>
                        ) : h.reasons[0] ? (
                          <p className="mt-1 text-xs text-[var(--gray-400)]">
                            {h.reasons[0]}
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-[10rem] text-sm text-[var(--gray-600)]">
                        <span className="line-clamp-2">{h.stageName}</span>
                      </td>
                      <td className="whitespace-nowrap text-sm text-[var(--gray-600)]">
                        {h.categoryHint ? getCategoryLabel(h.categoryHint) : "—"}
                      </td>
                      {recommendOn ? (
                        <td className="text-right tabular-nums text-sm text-[var(--gray-600)]">
                          {h.score > 0 ? h.score.toFixed(0) : "—"}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap text-right font-semibold tabular-nums text-[var(--navy)]">
                        {formatCurrency(h.available)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[var(--border)] px-5 py-3">
            <CatalogPager
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={PAGE_SIZE}
              params={filterBase}
            />
          </div>
        </div>
      )}
    </div>
  );
}
