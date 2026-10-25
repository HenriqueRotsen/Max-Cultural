"use client";

import { formatCurrency, formatDate } from "@/lib/format";
import { isExcludedFromBondItem } from "@/lib/compliance/rouanet";
import { TablePagination, usePagedSlice } from "@/components/InfiniteScroll";

type PaymentRow = {
  id: string;
  paymentDate: string | null;
  pronac: string;
  accountName: string;
  itemName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  amount: number;
  source: string;
};

export function SupplierPaymentsTable({ payments }: { payments: PaymentRow[] }) {
  const paging = usePagedSlice(payments);

  return (
    <div>
      <div className="table-wrap mt-4">
        <table className="data">
          <thead>
            <tr>
              <th>Data</th>
              <th>PRONAC</th>
              <th>Proponente</th>
              <th>Item</th>
              <th>Comprovante</th>
              <th>Valor</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {paging.slice.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.paymentDate)}</td>
                <td>{p.pronac}</td>
                <td>{p.accountName}</td>
                <td>
                  <span>{p.itemName || "—"}</span>
                  {isExcludedFromBondItem(p.itemName) ? (
                    <span
                      className="badge badge-muted ml-2"
                      title="Não entra na soma do vínculo art. 23"
                    >
                      Fora do vínculo
                    </span>
                  ) : null}
                </td>
                <td>
                  {p.documentType || "—"}
                  {p.documentNumber ? ` nº ${p.documentNumber}` : ""}
                </td>
                <td className="font-semibold text-[var(--navy)]">
                  {formatCurrency(p.amount)}
                </td>
                <td>
                  <span className={`badge ${p.source === "api" ? "badge-muted" : "badge-warn"}`}>
                    {p.source}
                  </span>
                </td>
              </tr>
            ))}
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
