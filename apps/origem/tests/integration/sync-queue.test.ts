import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncRunCount: vi.fn(),
  syncRunFindMany: vi.fn(),
  salicAccountFindMany: vi.fn(),
  closeDeadRunningRuns: vi.fn(),
  executeSyncRunSafe: vi.fn(),
  syncPlanningForWorkspace: vi.fn(),
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

vi.mock("@/lib/planning/federal/daily-sync", () => ({
  syncPlanningForWorkspace: mocks.syncPlanningForWorkspace,
}));

import {
  buildPlanningQueue,
  buildResumeQueue,
  buildSyncQueue,
  runSyncQueue,
} from "@/lib/sync/queue";

const syncOptions = (accountId: string, workspaceId = "ws1") => ({
  salicAccountId: accountId,
  workspaceId,
  forceCrawler: true,
});

describe("filas do SALIC (mock Prisma)", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    delete process.env.VERCEL;
  });

  it("fila da Auditoria só tem etapas de sync (nada de planejamento ou catálogo)", () => {
    const queue = buildSyncQueue([
      { run: { id: "r1" }, options: syncOptions("a1") },
      { run: { id: "r2" }, options: syncOptions("a2") },
    ]);
    expect(queue.map((j) => j.kind)).toEqual(["sync", "sync"]);
  });

  it("fila do Planejamento: uma etapa por proponente ativo Pro", async () => {
    mocks.salicAccountFindMany.mockResolvedValue([
      { id: "a1", workspaceId: "ws1" },
      { id: "a2", workspaceId: "ws1" },
    ]);

    expect(await buildPlanningQueue()).toEqual([
      { kind: "planning", workspaceId: "ws1", accountId: "a1" },
      { kind: "planning", workspaceId: "ws1", accountId: "a2" },
    ]);
  });

  it("executa as etapas em ordem e uma falha do planejamento não para a fila", async () => {
    mocks.syncPlanningForWorkspace
      .mockRejectedValueOnce(new Error("SALIC fora"))
      .mockResolvedValueOnce({});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runSyncQueue([
      { kind: "planning", workspaceId: "ws1", accountId: "a1" },
      { kind: "planning", workspaceId: "ws1", accountId: "a2" },
      { kind: "sync", syncRunId: "r1", options: syncOptions("a1") },
    ]);

    expect(mocks.syncPlanningForWorkspace).toHaveBeenCalledTimes(2);
    expect(mocks.syncPlanningForWorkspace.mock.calls[1]?.slice(0, 2)).toEqual(["ws1", "a2"]);
    expect(mocks.executeSyncRunSafe).toHaveBeenCalledWith("r1", syncOptions("a1"));
    errSpy.mockRestore();
    logSpy.mockRestore();
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
