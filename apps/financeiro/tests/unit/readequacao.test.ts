import { describe, expect, it } from "vitest";
import {
  budgetLineIdentityKey,
  validateReadequacaoSnapshot,
} from "@/lib/planning/readequacao";

describe("budgetLineIdentityKey", () => {
  it("prioriza planilhaAprovacaoId", () => {
    expect(
      budgetLineIdentityKey({
        planilhaAprovacaoId: "99",
        fonteRecurso: "Incentivo",
        productName: "P",
        stageName: "E",
        state: "SP",
        city: "SP",
        itemName: "Item",
      }),
    ).toBe("id:99");
  });

  it("usa chave composta sem id", () => {
    expect(
      budgetLineIdentityKey({
        planilhaAprovacaoId: null,
        fonteRecurso: "Incentivo",
        productName: "Prod",
        stageName: "Etapa",
        state: "RJ",
        city: "Rio",
        itemName: "Serviço",
      }),
    ).toBe("k:incentivo|prod|etapa|rj|rio|serviço");
  });
});

describe("validateReadequacaoSnapshot", () => {
  it("aceita linhas existentes e new-*", () => {
    const result = validateReadequacaoSnapshot({
      lines: [
        { id: "line-1", itemName: "TI", approvedAmount: 100 },
        { id: "new-abc", itemName: "Nova", approvedAmount: 50 },
      ],
      sheetLineIds: new Set(["line-1"]),
      reservedByLine: new Map([["line-1", 40]]),
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejeita id fora da planilha", () => {
    const result = validateReadequacaoSnapshot({
      lines: [{ id: "ghost", itemName: "X", approvedAmount: 10 }],
      sheetLineIds: new Set(["line-1"]),
      reservedByLine: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/inválida/i);
  });

  it("rejeita valor abaixo do reservado", () => {
    const result = validateReadequacaoSnapshot({
      lines: [{ id: "line-1", itemName: "TI", approvedAmount: 30 }],
      sheetLineIds: ["line-1"],
      reservedByLine: { "line-1": 50 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reservado/i);
  });
});
