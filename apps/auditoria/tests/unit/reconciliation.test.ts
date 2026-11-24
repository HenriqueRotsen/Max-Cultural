import { describe, expect, it } from "vitest";
import { findDuplicatePayments, reconcileProject, stageFromSituacao } from "@/lib/reconciliation";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("fase do projeto", () => {
  it("separa execução, prestação e encerrado", () => {
    expect(stageFromSituacao("E12-Autorizada a captação residual", "EM_ANDAMENTO")).toBe("execucao");
    expect(stageFromSituacao("D17-Aguarda publicação de portaria", "EM_ANDAMENTO")).toBe("execucao");
    expect(stageFromSituacao("E24-Apresentou prestação de contas", "EM_ANDAMENTO")).toBe("prestacao");
    expect(stageFromSituacao("E27-Análise Financeira da Prestação", "EM_ANDAMENTO")).toBe("prestacao");
    expect(stageFromSituacao("E30-Análise de resposta de diligência", "EM_ANDAMENTO")).toBe("prestacao");
    expect(stageFromSituacao("E19-Prestação de Contas Aprovada", "ENCERRADO")).toBe("encerrado");
  });
});

describe("captado × pago", () => {
  it("acima do captado e acima do teto de rendimento é fora da curva (caso 232829)", () => {
    const r = reconcileProject({
      captado: 1_100_000,
      pago: 1_378_925.15,
      situacao: "E24-Apresentou prestação de contas",
      lifecycleStatus: "EM_ANDAMENTO",
      firstMoneyAt: d("2023-10-30"),
      lastPaymentAt: d("2025-01-14"),
      duplicates: [{ supplierName: "X", amount: 900, times: 2, documentNumber: "REC 1", itemName: null, paymentDate: null }],
    });
    expect(r.stage).toBe("prestacao");
    expect(r.duplicateAmount).toBe(900);
    expect(r.notes.map((n) => n.code)).toEqual(["DUPLICADO", "ACIMA_FORA_DA_CURVA"]);
    expect(r.rendimentoTeto!).toBeLessThan(278_025);
  });

  it("acima do captado dentro do teto é compatível com rendimentos (caso 212441)", () => {
    const r = reconcileProject({
      captado: 1_000_000,
      pago: 1_220_268.59,
      situacao: "E24-Apresentou prestação de contas",
      lifecycleStatus: "EM_ANDAMENTO",
      firstMoneyAt: d("2021-12-29"),
      lastPaymentAt: d("2023-12-07"),
    });
    expect(r.notes.map((n) => n.code)).toEqual(["ACIMA_RENDIMENTO"]);
    expect(r.notes[0]!.level).toBe("info");
  });

  it("saldo: a executar, devolvido ou não comprovado conforme a fase", () => {
    const base = { captado: 1000, pago: 600, firstMoneyAt: null, lastPaymentAt: null };
    expect(reconcileProject({ ...base, situacao: "E12-Autorizada", lifecycleStatus: "EM_ANDAMENTO" }).notes[0]!.code).toBe(
      "SALDO_A_EXECUTAR",
    );
    expect(reconcileProject({ ...base, situacao: "E19", lifecycleStatus: "ENCERRADO" }).notes[0]!.code).toBe("SALDO_ENCERRADO");
    expect(
      reconcileProject({ ...base, situacao: "E24-Apresentou prestação de contas", lifecycleStatus: "EM_ANDAMENTO" }).notes[0]!
        .code,
    ).toBe("SALDO_NAO_COMPROVADO");
  });

  it("sem diferença não avisa", () => {
    expect(
      reconcileProject({ captado: 1000, pago: 1000.5, situacao: "E24", lifecycleStatus: "EM_ANDAMENTO", firstMoneyAt: null, lastPaymentAt: null })
        .notes,
    ).toEqual([]);
  });
});

describe("comprovantes repetidos", () => {
  const row = {
    supplierId: "s1",
    supplierName: "Fornecedor",
    amount: 900,
    documentNumber: "REC 87372",
    paymentDocumentNumber: "0000042239",
    planilhaAprovacaoId: "4903274",
    itemName: "Hospedagem",
    paymentDate: d("2024-07-23"),
  };
  it("mesmo comprovante na mesma linha do orçamento é duplicidade", () => {
    expect(findDuplicatePayments([row, { ...row }])).toMatchObject([{ times: 2, amount: 900 }]);
  });
  it("mesma nota em linhas diferentes do orçamento não é duplicidade", () => {
    expect(findDuplicatePayments([row, { ...row, planilhaAprovacaoId: "4903275" }])).toEqual([]);
  });
});
