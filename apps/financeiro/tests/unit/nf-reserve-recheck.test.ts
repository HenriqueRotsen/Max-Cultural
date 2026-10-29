import { describe, expect, it } from "vitest";
import {
  canReserveAmount,
  computeProjectBalance,
} from "@/lib/planning/rubric-balance";

/**
 * Simula duas reservas concorrentes no mesmo saldo: a 2ª deve falhar
 * quando o saldo é reavaliado após a 1ª (como na transaction com FOR UPDATE).
 */
describe("reserva NF — recheck de saldo", () => {
  it("segunda reserva no mesmo saldo esgotado falha no recheck", () => {
    const lines = [{ id: "a", approvedAmount: 100, productName: "TI" }];
    const first = computeProjectBalance({
      lines,
      commitments: [],
      valorCaptado: 100,
    });
    const ok1 = canReserveAmount({
      lineId: "a",
      amount: 80,
      balance: first,
      allowOverflow: false,
    });
    expect(ok1.ok).toBe(true);

    // Após commit da 1ª reserva, saldo vivo inclui o compromisso
    const second = computeProjectBalance({
      lines,
      commitments: [{ budgetLineId: "a", amount: 80, status: "RESERVED" }],
      valorCaptado: 100,
    });
    const ok2 = canReserveAmount({
      lineId: "a",
      amount: 80,
      balance: second,
      allowOverflow: false,
    });
    expect(ok2.ok).toBe(false);
  });
});
