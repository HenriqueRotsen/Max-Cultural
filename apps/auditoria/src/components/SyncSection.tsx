import { prisma } from "@/lib/db";
import { syncBlockedMessage } from "@/lib/auth/entitlements";
import { SyncPanel } from "@/components/SyncPanel";
import { hasHubPermission } from "@/lib/auth/hub-permissions";
import { AUTO_SYNC_PERMISSION } from "@/lib/sync/auto-sync-shared";

function serializeRun(run: {
  id: string;
  status: string;
  progressMessage: string | null;
  progressCurrent: number;
  progressTotal: number;
  projectsSynced: number;
  paymentsUpserted: number;
  errorMessage: string | null;
  log: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  forceCrawler: boolean;
  workState: unknown;
  salicAccount: { name: string; cgccpf: string } | null;
}) {
  const workState =
    run.workState && typeof run.workState === "object"
      ? (run.workState as { cursor?: number; items?: unknown[] })
      : null;
  return {
    id: run.id,
    status: run.status,
    progressMessage: run.progressMessage,
    progressCurrent: run.progressCurrent,
    progressTotal: run.progressTotal,
    projectsSynced: run.projectsSynced,
    paymentsUpserted: run.paymentsUpserted,
    errorMessage: run.errorMessage,
    log: run.log,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    forceCrawler: run.forceCrawler,
    workState,
    salicAccount: run.salicAccount,
  };
}

/** Atualização SALIC da Auditoria (espelho; não alimenta outros módulos). */
export async function SyncSection({
  workspaceId,
  syncEnabled,
}: {
  workspaceId: string;
  syncEnabled: boolean;
}) {
  if (!syncEnabled) {
    return (
      <div className="card p-5 text-sm text-[var(--gray-600)]">
        <p className="font-semibold text-[var(--navy)]">Atualização indisponível</p>
        <p className="mt-2">{syncBlockedMessage()}</p>
      </div>
    );
  }

  const workspaceRuns = {
    OR: [{ salicAccount: { workspaceId } }, { salicAccountId: null }],
  };
  const [accountCount, workspace, canManage, active, recent] = await Promise.all([
    prisma.salicAccount.count({ where: { active: true, workspaceId } }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        salicAutoSync: true,
        salicAutoSyncChangedAt: true,
        salicAutoSyncChangedById: true,
        salicAutoSyncNote: true,
      },
    }),
    hasHubPermission(AUTO_SYNC_PERMISSION),
    prisma.syncRun.findFirst({
      where: { status: { in: ["pending", "running"] }, ...workspaceRuns },
      orderBy: { createdAt: "desc" },
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    }),
    prisma.syncRun.findMany({
      where: workspaceRuns,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    }),
  ]);

  const changedBy = workspace?.salicAutoSyncChangedById
    ? await prisma.appUser.findUnique({
        where: { id: workspace.salicAutoSyncChangedById },
        select: { email: true },
      })
    : null;

  return (
    <SyncPanel
      accountCount={accountCount}
      canManage={canManage}
      autoSync={{
        enabled: workspace?.salicAutoSync ?? true,
        changedAt: workspace?.salicAutoSyncChangedAt?.toISOString() ?? null,
        changedBy: changedBy?.email ?? null,
        note: workspace?.salicAutoSyncNote ?? null,
      }}
      initialActive={active ? serializeRun(active) : null}
      initialRecent={recent.map(serializeRun)}
    />
  );
}
