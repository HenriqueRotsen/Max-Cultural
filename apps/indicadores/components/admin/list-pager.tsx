import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const HIERARQUIA_PAGE_SIZE = 25;

export function parseListPage(raw: string | undefined, pageCount: number) {
  const n = Number(raw);
  const max = Math.max(1, pageCount);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), max);
}

export function listPageCount(total: number, pageSize = HIERARQUIA_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize) || 1);
}

export function ListPager({
  page,
  pageCount,
  total,
  pageSize = HIERARQUIA_PAGE_SIZE,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize?: number;
  params: Record<string, string | undefined>;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function href(target: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (!value || key === "page") continue;
      next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  }

  const navBtn = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-sm text-muted-foreground">
      <span>
        Exibindo {from}–{to} de {total}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} className={navBtn}>
              Anterior
            </Link>
          ) : (
            <span className={cn(navBtn, "pointer-events-none opacity-40")}>
              Anterior
            </span>
          )}
          <span className="min-w-[7.5rem] text-center text-brand-deep">
            Página {page} de {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={href(page + 1)} className={navBtn}>
              Próxima
            </Link>
          ) : (
            <span className={cn(navBtn, "pointer-events-none opacity-40")}>
              Próxima
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
