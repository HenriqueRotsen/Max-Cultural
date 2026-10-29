import { describe, expect, it } from "vitest";
import {
  buildLockScopeKey,
  isForbiddenApprovedChange,
  isLineLocked,
  lockedLineIds,
  lockMatchesLine,
  type HierarchyLockRecord,
  type LockableLine,
} from "@/lib/planning/hierarchy-lock";
import {
  canReserveAmount,
  computeProjectBalance,
} from "@/lib/planning/rubric-balance";

const lines: LockableLine[] = [
  {
    id: "l1",
    fonteRecurso: "Incentivo Fiscal",
    productName: "Oficina A",
    stageName: "Fase 1",
    state: "MA",
    city: "Imperatriz",
  },
  {
    id: "l2",
    fonteRecurso: "Incentivo Fiscal",
    productName: "Oficina A",
    stageName: "Fase 1",
    state: "MA",
    city: "São Luís",
  },
  {
    id: "l3",
    fonteRecurso: "Incentivo Fiscal",
    productName: "Oficina B",
    stageName: "Fase 2",
    state: "MA",
    city: "Imperatriz",
  },
];

describe("hierarchy-lock", () => {
  it("monta scopeKey estável", () => {
    expect(
      buildLockScopeKey("PRODUCT", {
        fonteRecurso: "Incentivo Fiscal",
        productName: "Oficina A",
      }),
    ).toBe("PRODUCT|Incentivo Fiscal|Oficina A");
    expect(buildLockScopeKey("ITEM", { budgetLineId: "l1" })).toBe("ITEM|l1");
  });

  it("lock de cidade trava só itens daquela cidade", () => {
    const locks: HierarchyLockRecord[] = [
      {
        level: "CITY",
        scopeKey: "CITY|Incentivo Fiscal|Oficina A|Fase 1|MA|Imperatriz",
        fonteRecurso: "Incentivo Fiscal",
        productName: "Oficina A",
        stageName: "Fase 1",
        state: "MA",
        city: "Imperatriz",
      },
    ];
    expect(isLineLocked(lines[0]!, locks)).toBe(true);
    expect(isLineLocked(lines[1]!, locks)).toBe(false);
    expect(isLineLocked(lines[2]!, locks)).toBe(false);
  });

  it("lock de produto trava todas as etapas/cidades do produto", () => {
    const locks: HierarchyLockRecord[] = [
      {
        level: "PRODUCT",
        scopeKey: "PRODUCT|Incentivo Fiscal|Oficina A",
        fonteRecurso: "Incentivo Fiscal",
        productName: "Oficina A",
      },
    ];
    const ids = lockedLineIds(lines, locks);
    expect(ids.has("l1")).toBe(true);
    expect(ids.has("l2")).toBe(true);
    expect(ids.has("l3")).toBe(false);
  });

  it("lock de item é pontual", () => {
    const locks: HierarchyLockRecord[] = [
      {
        level: "ITEM",
        scopeKey: "ITEM|l2",
        budgetLineId: "l2",
      },
    ];
    expect(lockMatchesLine(locks[0]!, lines[1]!)).toBe(true);
    expect(isLineLocked(lines[0]!, locks)).toBe(false);
  });
});

describe("canReserveAmount com bloqueio", () => {
  it("recusa reserva em linha bloqueada", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "l1", approvedAmount: 1000, productName: "Oficina A" },
      ],
      commitments: [],
      lockedLineIds: new Set(["l1"]),
    });
    expect(bal.lines.get("l1")!.locked).toBe(true);
    expect(bal.lines.get("l1")!.available).toBe(0);

    const check = canReserveAmount({
      lineId: "l1",
      amount: 10,
      balance: bal,
      allowOverflow: false,
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toMatch(/bloqueada/i);
  });

  it("permite reserva em linha não bloqueada", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "l1", approvedAmount: 1000, productName: "Oficina A" },
      ],
      commitments: [],
      lockedLineIds: new Set(),
    });
    const check = canReserveAmount({
      lineId: "l1",
      amount: 10,
      balance: bal,
      allowOverflow: false,
    });
    expect(check.ok).toBe(true);
  });
});

describe("redistribuição com bloqueio", () => {
  it("rejeita mudança de aprovado em linha bloqueada", () => {
    const locked = new Set(["l1"]);
    expect(isForbiddenApprovedChange("l1", 100, 110, locked)).toBe(true);
    expect(isForbiddenApprovedChange("l1", 100, 100, locked)).toBe(false);
    expect(isForbiddenApprovedChange("l2", 100, 110, locked)).toBe(false);
  });
});
