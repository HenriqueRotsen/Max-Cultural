"use client";

import { TablePagination, usePagedSlice } from "@/components/InfiniteScroll";

type SyncRunRow = {
  id: string;
  status: string;
  progressMessage: string | null;
  projectsSynced: number;
  paymentsUpserted: number;
  errorMessage: string | null;
  createdAt: string;
  salicAccount: { name: string; cgccpf: string } | null;
};

function statusBadge(status: string) {
  if (status === "success") return "badge-success";
  if (status === "error") return "badge-warn";
  if (status === "running" || status === "pending") return "badge-warn";
  return "badge-muted";
}

function statusLabel(status: string) {
  if (status === "success") return "Concluída";
  if (status === "error") return "Com erro";
  if (status === "running") return "Em andamento";
  if (status === "pending") return "Na fila";
  return status;
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SyncHistoryTable({ recent }: { recent: SyncRunRow[] }) {
  const paging = usePagedSlice(recent);

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Conta</th>
              <th>Status</th>
              <th>Projetos</th>
              <th>Pagamentos</th>
              <th>Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {paging.slice.map((run) => (
              <tr key={run.id}>
                <td>{formatWhen(run.createdAt)}</td>
                <td>{run.salicAccount?.name || "Todas"}</td>
                <td>
                  <span className={`badge ${statusBadge(run.status)}`}>
                    {statusLabel(run.status)}
                  </span>
                </td>
                <td>{run.projectsSynced}</td>
                <td>{run.paymentsUpserted}</td>
                <td className="max-w-sm text-xs text-[var(--gray-500)]">
                  {run.errorMessage || run.progressMessage || "—"}
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={6} className="text-[var(--gray-500)]">
                  Nenhuma atualização ainda.
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
