"use client";

import { useEffect, useState } from "react";

export const PAGE_SIZE = 25;

export function usePagedSlice<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);

  return {
    slice,
    page,
    pageCount,
    setPage,
    pageSize,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
  };
}

export function TablePagination({
  page,
  pageCount,
  total,
  from,
  to,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-[var(--gray-500)]">
      <span>
        Exibindo {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          Anterior
        </button>
        <span className="min-w-[7.5rem] text-center text-[var(--navy)]">
          Página {page} de {pageCount}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
