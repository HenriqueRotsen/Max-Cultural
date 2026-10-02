import { prisma } from "@/lib/db";
import { syncBlockedMessage } from "@/lib/auth/entitlements";
import { SyncPanel } from "@/components/SyncPanel";

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

/** Atualização SALIC (auditoria + planejamento + Fluxo) na página de proponentes. */
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
  const [accounts, active, recent] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { active: true, workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cgccpf: true },
    }),
    prisma.syncRun.findFirst({
      where: { status: { in: ["pending", "running"] }, ...workspaceRuns },
      orderBy: { createdAt: "desc" },
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    }),
    prisma.syncRun.findMany({
      where: workspaceRuns,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    }),
  ]);

  return (
    <SyncPanel
      accounts={accounts}
      initialActive={active ? serializeRun(active) : null}
      initialRecent={recent.map(serializeRun)}
    />
  );
}
