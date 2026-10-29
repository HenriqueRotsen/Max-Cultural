import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  salicAccountFindMany: vi.fn(),
  syncPlanningForWorkspace: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { salicAccount: { findMany: mocks.salicAccountFindMany } },
}));

vi.mock("@/lib/planning/federal/daily-sync", () => ({
  syncPlanningForWorkspace: mocks.syncPlanningForWorkspace,
}));

import { buildPlanningQueue, runSyncQueue } from "@/lib/sync/queue";

describe("fila do Planejamento com o SALIC (mock Prisma)", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    delete process.env.VERCEL;
  });

  it("uma etapa por proponente ativo Pro", async () => {
    mocks.salicAccountFindMany.mockResolvedValue([
      { id: "a1", workspaceId: "ws1" },
      { id: "a2", workspaceId: "ws1" },
    ]);

    expect(await buildPlanningQueue()).toEqual([
      { kind: "planning", workspaceId: "ws1", accountId: "a1" },
      { kind: "planning", workspaceId: "ws1", accountId: "a2" },
    ]);
  });

  it("executa em ordem e uma falha não para a fila", async () => {
    mocks.syncPlanningForWorkspace
      .mockRejectedValueOnce(new Error("SALIC fora"))
      .mockResolvedValueOnce({});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runSyncQueue([
      { kind: "planning", workspaceId: "ws1", accountId: "a1" },
      { kind: "planning", workspaceId: "ws1", accountId: "a2" },
    ]);

    expect(mocks.syncPlanningForWorkspace).toHaveBeenCalledTimes(2);
    expect(mocks.syncPlanningForWorkspace.mock.calls[1]?.slice(0, 2)).toEqual(["ws1", "a2"]);
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});
