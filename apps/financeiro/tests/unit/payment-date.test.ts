import { describe, expect, it } from "vitest";
import { resolvePaymentDate } from "@/lib/planning/payment-date";

const today = "2026-11-11";
const ok = (r: ReturnType<typeof resolvePaymentDate>) =>
  "date" in r ? r.date.toISOString().slice(0, 10) : r.error;

describe("data do pagamento", () => {
  it("usa a data lida no comprovante", () => {
    expect(ok(resolvePaymentDate({ extracted: "2026-11-05", typed: "", today }))).toBe("2026-11-05");
  });

  it("usa a data digitada quando o comprovante não mostra", () => {
    expect(ok(resolvePaymentDate({ extracted: null, typed: "2026-11-03", today }))).toBe("2026-11-03");
  });

  it("bloqueia sem data nenhuma, em vez de usar hoje", () => {
    expect(ok(resolvePaymentDate({ extracted: null, typed: "", today }))).toMatch(/Informe a data/);
  });

  it("bloqueia data digitada diferente da lida", () => {
    expect(ok(resolvePaymentDate({ extracted: "2026-11-05", typed: "2026-11-06", today }))).toMatch(
      /05\/11\/2026.*06\/11\/2026/,
    );
  });

  it("bloqueia data no futuro", () => {
    expect(ok(resolvePaymentDate({ extracted: "2026-11-12", typed: "", today }))).toMatch(/futuro/);
  });

  it("bloqueia pagamento antes da emissão da NF", () => {
    expect(
      ok(resolvePaymentDate({ extracted: "2026-11-01", typed: "", nfDate: "2026-11-04", today })),
    ).toMatch(/anterior à emissão/);
    expect(
      ok(resolvePaymentDate({ extracted: "2026-11-04", typed: "", nfDate: "2026-11-04", today })),
    ).toBe("2026-11-04");
  });

  it("ignora datas inválidas", () => {
    expect(ok(resolvePaymentDate({ extracted: "2026-02-31", typed: "", today }))).toMatch(/Informe a data/);
  });
});
