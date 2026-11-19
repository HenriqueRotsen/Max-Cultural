import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import {
  REPORT_PAYMENTS_PER_PART,
  renderAuditoriaReportParts,
  type AuditoriaPronacBlock,
} from "@/lib/reports/html";
import { DEFAULT_RULES } from "@/lib/compliance/defaults";

function block(i: number, payments: number): AuditoriaPronacBlock {
  return {
    pronac: String(220000 + i),
    name: `Projeto ${i}`,
    accountName: "PROPONENTE",
    accountCgccpf: "12345678000190",
    rules: DEFAULT_RULES,
    relatedParties: [],
    projectTotal: 100000,
    paidTotal: 50000,
    suppliers: [{ name: "FORNECEDOR", cgccpf: "11222333000144", total: 50000, percent: 50, count: payments }],
    bondSuppliers: [],
    watchedSuppliers: [],
    payments: Array.from({ length: payments }, (_, k) => ({
      paymentDate: "2025-01-10T00:00:00.000Z",
      supplierName: "FORNECEDOR",
      itemName: "Item",
      documentNumber: `NF ${k}`,
      amount: 10,
    })),
    corporateMapHtml: "",
    situacao: "E24 - Apresentou prestação de contas",
    situacaoAt: "2026-11-19T11:05:00.000Z",
    alertsSummary: "",
  };
}

describe("relatório de auditoria em partes", () => {
  it("relatório pequeno sai num documento só, com a situação do SALIC", async () => {
    const parts = await renderAuditoriaReportParts({ blocks: [block(0, 10), block(1, 10)] });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("No SALIC");
    expect(parts[0]).toContain("Prestação de contas em análise");
    expect(parts[0]).toContain("Situação no SALIC em 19/11/2026 · 08:05.");
  });

  it("relatório grande é dividido: capa, cada PRONAC e o anexo em fatias", async () => {
    const big = REPORT_PAYMENTS_PER_PART * 2 + 5; // 3 fatias
    const parts = await renderAuditoriaReportParts({ blocks: [block(0, big), block(1, 10)] });
    // capa + (PRONAC 0 + 3 fatias) + PRONAC 1
    expect(parts).toHaveLength(6);
    expect(parts[0]).toContain("Relatório de Auditoria");
    expect(parts[1]).not.toContain('class="header"');
    expect(parts[2]).toContain("parte 1 de 3");
    expect(parts[5]).toContain("Documento gerado automaticamente");
    expect(parts[0]).not.toContain("Documento gerado automaticamente");
  });
});
