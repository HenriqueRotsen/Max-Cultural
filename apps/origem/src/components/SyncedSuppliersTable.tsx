"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCurrency, formatCgccpf } from "@/lib/format";
import { TablePagination, usePagedSlice } from "@/components/InfiniteScroll";

type SupplierRow = {
  id: string;
  name: string;
  cgccpf: string;
  payments: number;
  total: number;
};

type SortKey = "name" | "cgccpf" | "payments" | "total";
type SortDir = "asc" | "desc";

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function SyncedSuppliersTable({ suppliers }: { suppliers: SupplierRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = digits(query);
    let rows = suppliers;
    if (q) {
      rows = suppliers.filter((s) => {
        const nameMatch = s.name.toLowerCase().includes(q);
        const docMatch = qDigits
          ? digits(s.cgccpf).includes(qDigits)
          : s.cgccpf.toLowerCase().includes(q);
        return nameMatch || docMatch;
      });
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name" || sortKey === "cgccpf") {
        return a[sortKey].localeCompare(b[sortKey], "pt-BR") * dir;
      }
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [suppliers, query, sortKey, sortDir]);

  const paging = usePagedSlice(filtered);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" || key === "cgccpf" ? "asc" : "desc");
  }

  function sortLabel(key: SortKey, label: string) {
    if (sortKey !== key) return label;
    return `${label} ${sortDir === "asc" ? "↑" : "↓"}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="field min-w-[16rem] flex-1">
          <label htmlFor="supplier-filter">Buscar</label>
          <input
            id="supplier-filter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome ou CNPJ/CPF"
          />
        </div>
        <p className="pb-2 text-sm text-[var(--gray-500)]">
          {filtered.length} de {suppliers.length} fornecedor
          {suppliers.length === 1 ? "" : "es"}
        </p>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>
                <button type="button" className="sort-th" onClick={() => toggleSort("name")}>
                  {sortLabel("name", "Nome")}
                </button>
              </th>
              <th>
                <button type="button" className="sort-th" onClick={() => toggleSort("cgccpf")}>
                  {sortLabel("cgccpf", "CNPJ/CPF")}
                </button>
              </th>
              <th>
                <button type="button" className="sort-th" onClick={() => toggleSort("total")}>
                  {sortLabel("total", "Total")}
                </button>
              </th>
              <th>
                <button type="button" className="sort-th" onClick={() => toggleSort("payments")}>
                  {sortLabel("payments", "Pagamentos")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {paging.slice.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link
                    href={`/panorama/${s.id}?from=fornecedores`}
                    className="font-semibold text-[var(--navy)] underline-offset-2 hover:text-[var(--gold)] hover:underline"
                  >
                    {s.name}
                  </Link>
                </td>
                <td>{formatCgccpf(s.cgccpf)}</td>
                <td className="font-medium text-[var(--navy)]">{formatCurrency(s.total)}</td>
                <td>{s.payments}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-[var(--gray-500)]">
                  {suppliers.length === 0
                    ? "Ainda sem fornecedores — atualize os dados primeiro."
                    : "Nenhum fornecedor corresponde à busca."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={paging.page}
        pageCount={paging.pageCount}
        total={paging.total}
        from={paging.from}
        to={paging.to}
        onPageChange={paging.setPage}
      />
    </div>
  );
}
