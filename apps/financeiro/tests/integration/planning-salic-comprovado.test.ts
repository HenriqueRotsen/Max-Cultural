import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  planningFindUnique: vi.fn(),
  sheetFindUnique: vi.fn(),
  lineUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    planningProject: { findUnique: mocks.planningFindUnique },
    projectBudgetSheet: { findUnique: mocks.sheetFindUnique },
    projectBudgetLine: { update: mocks.lineUpdate },
  },
}));

import { syncSalicComprovadoFromSalicItems } from "@/lib/planning/federal/salic-reconcile";

const lines = [
  { id: "L1", planilhaAprovacaoId: "10", itemName: "Cachê", homologatedAmount: 1000, salicComprovado: null },
  { id: "L2", planilhaAprovacaoId: "20", itemName: "Som", homologatedAmount: 500, salicComprovado: null },
  { id: "L3", planilhaAprovacaoId: "30", itemName: "Som", homologatedAmount: 1500, salicComprovado: 999 },
  { id: "L4", planilhaAprovacaoId: "40", itemName: "Luz", homologatedAmount: 200, salicComprovado: 80 },
];

const item = (id: string, planilha: string | null, amount: number, rubricItem: string | null) => ({
  id,
  planilhaAprovacaoId: planilha,
  amount,
  rubricItem,
  supplierName: "Fornecedor",
  supplierDoc: "",
  paymentDate: null,
  proofNumber: null,
});

describe("comprovado por rubrica a partir da relação de pagamentos do SALIC", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.planningFindUnique.mockResolvedValue({ sheet: { lines } });
    mocks.sheetFindUnique.mockResolvedValue({ lines });
  });

  it("casa por planilha, rateia órfãos pelo homologado e zera linhas sem pagamento", async () => {
    const result = await syncSalicComprovadoFromSalicItems("pp1", [
      item("c1", "10", 300, "Cachê"),
      item("c2", "99", 400, "som"), // ID de planilha antiga → item homônimo
      item("c3", "20", 50, "Som"),
    ]);

    const written = Object.fromEntries(
      mocks.lineUpdate.mock.calls.map(([arg]) => [arg.where.id, arg.data.salicComprovado]),
    );
    expect(written).toEqual({ L1: 300, L2: 150, L3: 300, L4: null });
    expect(result).toMatchObject({ paymentCount: 3, paymentTotal: 750, orphanPayments: 1 });
  });

  it("sem planilha no planejamento não grava nada", async () => {
    mocks.planningFindUnique.mockResolvedValue({ sheet: null });
    const result = await syncSalicComprovadoFromSalicItems("pp1", [item("c1", "10", 300, null)]);
    expect(result.updated).toBe(0);
    expect(mocks.lineUpdate).not.toHaveBeenCalled();
  });
});
