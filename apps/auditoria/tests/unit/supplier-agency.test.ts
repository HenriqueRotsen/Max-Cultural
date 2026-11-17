import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { withAgency } from "@/lib/supplier-agency";
import { evaluatePronacSupplierCompliance, worstComplianceTone } from "@/lib/compliance/rouanet";

const maps = new Map([["ws1", new Map([["11222333000181", 10]])]]);

describe("fornecedor agência na Auditoria", () => {
  it("só o percentual da agência conta (capTotal)", () => {
    const [a, b] = withAgency(
      [
        { name: "Agência", cgccpf: "11222333000181", total: 50_000 },
        { name: "Outro", cgccpf: "99888777000166", total: 5_000 },
      ],
      maps,
      "ws1",
    );
    expect(a).toMatchObject({ capTotal: 5_000, agencyPct: 10 });
    expect(b).toMatchObject({ capTotal: 5_000, agencyPct: null });
    // Outro espaço de trabalho: não é agência.
    expect(withAgency([{ name: "Agência", cgccpf: "11222333000181", total: 1 }], maps, "ws2")[0])
      .toMatchObject({ capTotal: 1, agencyPct: null });
  });

  it("agência com 50% pago não passa do limite de 20%", () => {
    const suppliers = withAgency(
      [{ name: "Agência", cgccpf: "11222333000181", total: 50_000 }],
      maps,
      "ws1",
    );
    const alerts = evaluatePronacSupplierCompliance({
      pronac: "123456",
      projectTotal: 100_000,
      suppliers,
    });
    expect(alerts.filter((a) => a.level === "critical")).toHaveLength(0);
    expect(worstComplianceTone(suppliers, 100_000)).toBe("ok");
    // Sem a marcação, seria vermelho.
    expect(worstComplianceTone([{ cgccpf: "11222333000181", total: 50_000 }], 100_000)).toBe(
      "critical",
    );
  });

  it("aviso de agência perto do limite diz quanto foi pago", () => {
    const suppliers = withAgency(
      [{ name: "Agência", cgccpf: "11222333000181", total: 250_000 }],
      maps,
      "ws1",
    );
    const [alert] = evaluatePronacSupplierCompliance({
      pronac: "123456",
      projectTotal: 100_000,
      suppliers,
    });
    expect(alert.level).toBe("critical");
    expect(alert.detail).toContain("é agência: conta 10%");
  });
});
