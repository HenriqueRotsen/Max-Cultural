import { AdminShell } from "@/components/admin/admin-shell";
import { AuditoriaManager } from "@/components/admin/auditoria-manager";
import {
  listAuditFilterOptionsAction,
  listAuditLogsAction,
} from "@/app/actions/acesso";
import { requireDashboardPermission } from "@/lib/dashboard-gate";

export default async function AuditoriaPage() {
  await requireDashboardPermission("audit:read");
  const [{ logs, total }, filterOptions] = await Promise.all([
    listAuditLogsAction({ take: 200 }),
    listAuditFilterOptionsAction(),
  ]);

  return (
    <AdminShell title="Auditoria">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand-deep">
          Auditoria
        </h1>
        <p className="text-sm text-muted-foreground">
          Cópia local dos eventos. A trilha oficial fica no hub{" "}
          <a
            href={(process.env.NEXT_PUBLIC_CULTURAL_URL || "http://localhost:3000").replace(
              /\/$/,
              "",
            ) + "/logs"}
            className="underline underline-offset-2"
          >
            MAX Cultural → Logs
          </a>
          .
        </p>
      </div>
      <AuditoriaManager
        initialLogs={logs}
        initialTotal={total}
        filterOptions={filterOptions}
      />
    </AdminShell>
  );
}
