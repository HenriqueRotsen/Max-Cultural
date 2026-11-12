import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  watchedCount: 0,
  accountCount: 0,
  updateMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    corporatePeriod: {
      count: vi.fn(async ({ where }: { where: Record<string, string> }) =>
        "watchedSupplierId" in where ? db.watchedCount : db.accountCount,
      ),
      updateMany: db.updateMany,
    },
  },
}));

import { unifyWatchedMapIntoAccount } from "@/lib/corporate/map-owner";

describe("unifyWatchedMapIntoAccount (um CNPJ, um mapa)", () => {
  beforeEach(() => {
    db.updateMany.mockClear();
  });

  it("sem mapa no observado, não mexe em nada", async () => {
    db.watchedCount = 0;
    db.accountCount = 3;
    expect(await unifyWatchedMapIntoAccount("w", "a")).toEqual({ moved: 0, leftover: 0 });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("mapa do proponente vazio: os intervalos do observado passam para ele", async () => {
    db.watchedCount = 2;
    db.accountCount = 0;
    db.updateMany.mockResolvedValueOnce({ count: 2 });
    expect(await unifyWatchedMapIntoAccount("w", "a")).toEqual({ moved: 2, leftover: 0 });
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { watchedSupplierId: "w" },
      data: { salicAccountId: "a", watchedSupplierId: null },
    });
  });

  it("os dois com intervalos: não junta nem apaga, só avisa", async () => {
    db.watchedCount = 2;
    db.accountCount = 4;
    expect(await unifyWatchedMapIntoAccount("w", "a")).toEqual({ moved: 0, leftover: 2 });
    expect(db.updateMany).not.toHaveBeenCalled();
  });
});
