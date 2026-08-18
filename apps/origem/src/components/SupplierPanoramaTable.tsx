"use client";

import Link from "next/link";
import { formatCurrency, formatCgccpf } from "@/lib/format";
import { TablePagination, usePagedSlice } from "@/components/InfiniteScroll";

export type SupplierPanoramaRow = {
  supplierId: string;
  name: string;
  cgccpf: string;
  total: number;
  count: number;
  projectCount: number;
  byAccount: Array<{ accountId: string; name: string; total: number; count: number }>;
};

export function SupplierPanoramaTable({ rows }: { rows: SupplierPanoramaRow[] }) {
  const paging = usePagedSlice(rows);

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>CNPJ/CPF</th>
              <th>Total</th>
              <th>Pagamentos</th>
              <th>Projetos</th>
              <th>Por proponente</th>
            </tr>
          </thead>
          <tbody>
            {paging.slice.map((row) => (
              <tr key={row.supplierId}>
                <td>
                  <Link
                    href={`/panorama/${row.supplierId}`}
                    className="font-semibold text-[var(--navy)] underline-offset-2 hover:text-[var(--gold)] hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td>{formatCgccpf(row.cgccpf)}</td>
                <td className="font-semibold text-[var(--navy)]">{formatCurrency(row.total)}</td>
                <td>{row.count}</td>
                <td>{row.projectCount}</td>
                <td>
                  <ul className="space-y-1 text-sm text-[var(--gray-500)]">
                    {row.byAccount.map((a) => (
                      <li key={a.accountId}>
                        {a.name}: {formatCurrency(a.total)} ({a.count})
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-[var(--gray-500)]">
                  Sem dados. Cadastre contas, atualize os dados e marque fornecedores.
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
