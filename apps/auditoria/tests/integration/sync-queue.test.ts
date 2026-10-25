import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncRunCount: vi.fn(),
  syncRunFindMany: vi.fn(),
  salicAccountFindMany: vi.fn(),
  closeDeadRunningRuns: vi.fn(),
  executeSyncRunSafe: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    syncRun: { count: mocks.syncRunCount, findMany: mocks.syncRunFindMany },
    salicAccount: { findMany: mocks.salicAccountFindMany },
  },
}));

vi.mock("@/lib/sync/run", () => ({
  closeDeadRunningRuns: mocks.closeDeadRunningRuns,
  executeSyncRunSafe: mocks.executeSyncRunSafe,
}));

import { buildResumeQueue, buildSyncQueue, runSyncQueue } from "@/lib/sync/queue";

const syncOptions = (accountId: string, workspaceId = "ws1") => ({
  salicAccountId: accountId,
  workspaceId,
  forceCrawler: true,
});

describe("fila do sync da Auditoria (mock Prisma)", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    delete process.env.VERCEL;
  });

  it("uma etapa de sync por conta", () => {
    const queue = buildSyncQueue([
      { run: { id: "r1" }, options: syncOptions("a1") },
      { run: { id: "r2" }, options: syncOptions("a2") },
    ]);
    expect(queue.map((j) => j.kind)).toEqual(["sync", "sync"]);
  });

  it("executa as contas em ordem", async () => {
    await runSyncQueue([
      { kind: "sync", syncRunId: "r1", options: syncOptions("a1") },
      { kind: "sync", syncRunId: "r2", options: syncOptions("a2") },
    ]);
    expect(mocks.executeSyncRunSafe.mock.calls.map((c) => c[0])).toEqual(["r1", "r2"]);
  });

  it("não retoma enquanto há rodada em execução", async () => {
    mocks.syncRunCount.mockResolvedValue(1);

    expect(await buildResumeQueue()).toEqual([]);
    expect(mocks.closeDeadRunningRuns).toHaveBeenCalledOnce();
    expect(mocks.syncRunFindMany).not.toHaveBeenCalled();
  });

  it("recoloca as contas que ficaram pendentes", async () => {
    mocks.syncRunCount.mockResolvedValue(0);
    mocks.syncRunFindMany.mockResolvedValue([
      { id: "run-vivas", salicAccountId: "acc-vivas", salicAccount: { workspaceId: "ws1" } },
    ]);

    expect(await buildResumeQueue()).toEqual([
      { kind: "sync", syncRunId: "run-vivas", options: syncOptions("acc-vivas") },
    ]);
  });
});
