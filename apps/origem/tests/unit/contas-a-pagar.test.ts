import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTAS_FILTERS,
  filterAndSortContasAPagar,
  type ContasAPagarRow,
} from "@/lib/planning/contas-a-pagar";

const sample: ContasAPagarRow[] = [
  {
    id: "1",
    amount: 100,
    expectedPayAt: "2026-09-01T12:00:00.000Z",
    status: "RESERVED",
    installmentNumber: 1,
    planningProjectId: "p1",
    externalCode: "123456",
    projectName: "A",
    supplierName: "Alpha",
    supplierCnpj: "111",
    rubricLabel: "Produção",
    origin: "pedido",
    pedidoId: "ped1",
  },
  {
    id: "2",
    amount: 250,
    expectedPayAt: "2026-09-20T12:00:00.000Z",
    status: "RESERVED",
    installmentNumber: null,
    planningProjectId: "p2",
    externalCode: "654321",
    projectName: "B",
    supplierName: "Beta",
    supplierCnpj: "222",
    rubricLabel: "Admin",
    origin: "reserva",
    pedidoId: null,
  },
];

describe("contas-a-pagar filters", () => {
  it("filters by origin and sorts by amount", () => {
    const rows = filterAndSortContasAPagar(sample, {
      ...DEFAULT_CONTAS_FILTERS,
      origin: "reserva",
      sort: "amount_desc",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("2");
  });

  it("filters overdue relative to now", () => {
    const rows = filterAndSortContasAPagar(
      sample,
      { ...DEFAULT_CONTAS_FILTERS, due: "overdue" },
      new Date("2026-09-10T12:00:00"),
    );
    expect(rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("uses dueSoonDays for upcoming window", () => {
    const rows = filterAndSortContasAPagar(
      sample,
      { ...DEFAULT_CONTAS_FILTERS, due: "upcoming" },
      new Date("2026-09-01T12:00:00"),
      5,
    );
    // 01/09 is today; 20/09 is outside 5-day window
    expect(rows.map((r) => r.id)).toEqual(["1"]);
  });
});
