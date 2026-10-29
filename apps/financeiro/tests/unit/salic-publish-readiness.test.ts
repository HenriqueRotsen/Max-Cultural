import { describe, expect, it } from "vitest";
import { assessSalicPublishReadiness } from "@/lib/planning/lifecycle";

describe("assessSalicPublishReadiness", () => {
  it("permite envio só com comprovante (pagamento antecipado)", () => {
    const r = assessSalicPublishReadiness({
      hasSheet: true,
      documents: [{ kind: "PAYMENT_PROOF", status: "IMPORTED" }],
      commitments: [{ status: "PAID", nfPending: true }],
    });
    expect(r.ok).toBe(true);
  });

  it("bloqueia reservas sem comprovante", () => {
    const r = assessSalicPublishReadiness({
      hasSheet: true,
      documents: [{ kind: "NF", status: "IMPORTED" }],
      commitments: [{ status: "RESERVED" }],
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/comprovante/i);
  });
});
