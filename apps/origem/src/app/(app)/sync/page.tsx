import Link from "next/link";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { syncBlockedMessage } from "@/lib/auth/entitlements";
import { PageHeader } from "@/components/ui";
import { SyncPanel } from "@/components/SyncPanel";

export const dynamic = "force-dynamic";

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

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pageError = typeof sp.error === "string" ? sp.error : null;
  const { entitlements } = await getWorkspaceContext();

  if (!entitlements.syncEnabled) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumb="Início › Atualizar"
          title="Atualizar dados"
          description="Sincronização com o SALIC."
        />
        <div className="card p-5 text-sm text-[var(--gray-600)]">
          <p className="font-semibold text-[var(--navy)]">Indisponível no plano Essencial</p>
          <p className="mt-2">{syncBlockedMessage()}</p>
          <Link href="/contato?plano=Pro" className="btn btn-gold mt-4 inline-flex">
            Falar sobre o plano Pro
          </Link>
        </div>
      </div>
    );
  }

  const [accounts, active, recent] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { active: true, workspaceId: entitlements.workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cgccpf: true },
    }),
    prisma.syncRun.findFirst({
      where: {
        status: { in: ["pending", "running"] },
        OR: [
          { salicAccount: { workspaceId: entitlements.workspaceId } },
          { salicAccountId: null },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    }),
    prisma.syncRun.findMany({
      where: {
        OR: [
          { salicAccount: { workspaceId: entitlements.workspaceId } },
          { salicAccountId: null },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Início › Atualizar"
        title="Atualizar dados"
        description="Busca projetos e pagamentos no SALIC. O histórico fica abaixo do progresso."
      />

      {pageError && (
        <div className="rounded-xl border border-[#e5d3bb] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--navy)]">
          {pageError}
        </div>
      )}

      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm text-[var(--navy)]"
        role="status"
      >
        <p className="font-semibold">Atualização automática</p>
        <p className="mt-1 text-[var(--gray-600)]">
          O Salink já atualiza sozinho, todos os dias por volta das{" "}
          <strong className="font-semibold text-[var(--navy)]">10h</strong>, as contas com
          atualização ligada. Use o botão abaixo só quando quiser atualizar agora, fora desse
          horário.
        </p>
        <p className="mt-2 text-[var(--gray-600)]">
          Marcar <strong className="font-semibold text-[var(--navy)]">Usar área logada do SALIC</strong>{" "}
          costuma deixar a atualização{" "}
          <strong className="font-semibold text-[var(--navy)]">mais rápida</strong>, mas é preciso ter
          cadastrado o{" "}
          <strong className="font-semibold text-[var(--navy)]">usuário e a senha do SALIC</strong> na
          conta (login próprio do sistema,{" "}
          <strong className="font-semibold text-[var(--navy)]">não o Gov.br</strong>).
        </p>
      </div>

      <SyncPanel
        accounts={accounts}
        initialActive={active ? serializeRun(active) : null}
        initialRecent={recent.map(serializeRun)}
      />
    </div>
  );
}
