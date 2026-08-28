import { describe, expect, it } from "vitest";
import {
  formatCnaeCode,
  formatCnaeInput,
  formatCnaeLabel,
  normalizeCnaeCode,
} from "@/lib/catalog/cnae";

describe("cnae", () => {
  it("normaliza para 7 dígitos", () => {
    expect(normalizeCnaeCode("6201-5/01")).toBe("6201501");
    expect(normalizeCnaeCode("")).toBeNull();
  });

  it("máscara progressiva", () => {
    expect(formatCnaeInput("6201")).toBe("6201");
    expect(formatCnaeInput("62015")).toBe("6201-5");
    expect(formatCnaeInput("6201501")).toBe("6201-5/01");
  });

  it("label com descrição", () => {
    expect(formatCnaeCode("6201501")).toBe("6201-5/01");
    expect(formatCnaeLabel("6201501", "Desenvolvimento de software")).toBe(
      "6201-5/01 — Desenvolvimento de software",
    );
  });
});
