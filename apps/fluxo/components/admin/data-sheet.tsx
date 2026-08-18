"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100, 200] as const;

const PAGE_SIZE_ITEMS = Object.fromEntries(
  PAGE_SIZES.map((size) => [String(size), `${size} / pág.`]),
);

const MIN_COL_WIDTH = 64;
const MAX_COL_WIDTH = 720;

/** Busca: ignora maiúsculas/minúsculas e acentuação (ex.: "jose" encontra "José"). */
function foldSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function useDataSheet<T>(
  items: T[],
  searchText: (item: T) => string,
  initialPageSize = 50,
) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    const q = foldSearch(query.trim());
    if (!q) return items;
    return items.filter((item) => foldSearch(searchText(item)).includes(q));
  }, [items, query, searchText]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  function setQueryAndReset(value: string) {
    setQuery(value);
    setPage(1);
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return {
    query,
    setQuery: setQueryAndReset,
    page: safePage,
    setPage,
    pageSize,
    setPageSize: changePageSize,
    filtered,
    pageItems,
    total: filtered.length,
    totalAll: items.length,
    totalPages,
    rangeLabel:
      filtered.length === 0
        ? "0 resultados"
        : `${start + 1}–${Math.min(start + pageSize, filtered.length)} de ${filtered.length}`,
  };
}

type DataSheetProps = {
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  page: number;
  pageSize: number;
  totalPages: number;
  rangeLabel: string;
  total: number;
  totalAll?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  stickyFirstCol?: boolean;
  className?: string;
  scrollClassName?: string;
  toolbarExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function DataSheet({
  title,
  subtitle,
  searchPlaceholder = "Buscar…",
  query,
  onQueryChange,
  page,
  pageSize,
  totalPages,
  rangeLabel,
  total,
  totalAll,
  onPageChange,
  onPageSizeChange,
  stickyFirstCol = true,
  className,
  scrollClassName,
  toolbarExtra,
  footer,
  children,
}: DataSheetProps) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-brand/10 bg-white/90 shadow-sm",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-border/70 bg-brand-mist/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {title ? (
            <div className="font-heading text-base font-semibold text-brand-deep">
              {title}
            </div>
          ) : null}
          {subtitle ? (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {rangeLabel}
              {totalAll != null && totalAll !== total
                ? ` · filtrado de ${totalAll}`
                : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 bg-white pl-8"
            />
          </div>
          {toolbarExtra}
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v ?? 50))}
            items={PAGE_SIZE_ITEMS}
          >
            <SelectTrigger className="h-8 w-[7.5rem] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / pág.
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        className={cn(
          "sc-sheet-scroll min-h-0 max-h-[min(70vh,42rem)] flex-1 overflow-auto",
          stickyFirstCol && "sc-sheet-sticky-col",
          scrollClassName,
        )}
      >
        {children}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-white px-4 py-2.5">
        <div className="text-xs text-muted-foreground tabular-nums">
          {rangeLabel}
          {total === 0 ? null : ` · ${totalPages} página(s)`}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
            Anterior
          </Button>
          <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground">
            {page}/{totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Próxima
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {footer}
    </div>
  );
}

type SheetTableContextValue = {
  widths: number[] | null;
  startResize: (colIndex: number, clientX: number) => void;
  resetWidths: () => void;
};

const SheetTableContext = createContext<SheetTableContextValue | null>(null);

function useSheetTable() {
  return useContext(SheetTableContext);
}

/** Tabela com autoajuste ao conteúdo e redimensionamento de colunas. */
export function SheetTable({
  className,
  children,
  ...props
}: React.ComponentProps<"table">) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);
  const dragRef = useRef<{
    index: number;
    startX: number;
    startWidths: number[];
  } | null>(null);

  const resetWidths = useCallback(() => {
    setWidths(null);
  }, []);

  const startResize = useCallback((colIndex: number, clientX: number) => {
    const table = tableRef.current;
    if (!table) return;
    const ths = table.querySelectorAll<HTMLTableCellElement>("thead th");
    if (!ths.length) return;
    const startWidths = Array.from(ths).map((th) =>
      Math.max(MIN_COL_WIDTH, Math.round(th.getBoundingClientRect().width)),
    );
    dragRef.current = { index: colIndex, startX: clientX, startWidths };
    setWidths(startWidths);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const table = tableRef.current;
    if (!table || !widths) return;
    const count = table.querySelectorAll("thead th").length;
    if (count > 0 && count !== widths.length) {
      setWidths(null);
    }
  });

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      const next = [...drag.startWidths];
      const base = drag.startWidths[drag.index] ?? MIN_COL_WIDTH;
      next[drag.index] = Math.min(
        MAX_COL_WIDTH,
        Math.max(MIN_COL_WIDTH, Math.round(base + delta)),
      );
      setWidths(next);
    }

    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const ctx = useMemo<SheetTableContextValue>(
    () => ({
      widths,
      startResize,
      resetWidths,
    }),
    [widths, startResize, resetWidths],
  );

  const totalWidth = widths?.reduce((sum, w) => sum + w, 0);

  return (
    <SheetTableContext.Provider value={ctx}>
      <table
        ref={tableRef}
        className={cn(
          "sc-sheet-table caption-bottom border-separate border-spacing-0 text-sm",
          widths ? "table-fixed" : "table-auto",
          className,
        )}
        style={
          widths
            ? { width: totalWidth, minWidth: "100%" }
            : { width: "max-content", minWidth: "100%" }
        }
        {...props}
      >
        {widths ? (
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
        ) : null}
        {children}
      </table>
    </SheetTableContext.Provider>
  );
}

export function SheetThead({
  className,
  ...props
}: React.ComponentProps<"thead">) {
  return <thead className={cn("sc-sheet-head", className)} {...props} />;
}

export function SheetTh({
  className,
  sticky,
  stickyEnd,
  children,
  style,
  ...props
}: React.ComponentProps<"th"> & { sticky?: boolean; stickyEnd?: boolean }) {
  const sheet = useSheetTable();
  const thRef = useRef<HTMLTableCellElement>(null);

  return (
    <th
      ref={thRef}
      className={cn(
        "sc-sheet-th relative h-9 border-b bg-brand-mist/90 px-2.5 text-left align-middle text-xs font-semibold tracking-wide whitespace-nowrap text-brand-deep backdrop-blur-sm",
        sticky && "sc-sheet-sticky-cell",
        stickyEnd && "sc-sheet-sticky-end",
        className,
      )}
      style={style}
      {...props}
    >
      <div className="pr-2">{children}</div>
      {sheet ? (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar coluna"
          title="Arraste para redimensionar · duplo clique para ajustar ao texto"
          className="sc-sheet-col-resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const th = thRef.current;
            const table = th?.closest("table");
            if (!th || !table) return;
            const ths = table.querySelectorAll("thead th");
            const index = Array.from(ths).indexOf(th);
            if (index < 0) return;
            sheet.startResize(index, e.clientX);
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            sheet.resetWidths();
          }}
        />
      ) : null}
    </th>
  );
}

export function SheetTd({
  className,
  sticky,
  stickyEnd,
  ...props
}: React.ComponentProps<"td"> & { sticky?: boolean; stickyEnd?: boolean }) {
  return (
    <td
      className={cn(
        "border-b border-border/60 bg-white px-2.5 py-1.5 align-middle text-sm whitespace-nowrap",
        sticky && "sc-sheet-sticky-cell",
        stickyEnd && "sc-sheet-sticky-end",
        className,
      )}
      {...props}
    />
  );
}

export function SheetTr({
  className,
  ...props
}: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "hover:bg-brand-mist/40 [&:hover_td]:bg-brand-mist/40",
        className,
      )}
      {...props}
    />
  );
}
