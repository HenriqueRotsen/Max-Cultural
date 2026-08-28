import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  extractProjectYear,
  formatCpfDisplay,
  formatPhoneDisplay,
  normalizeAnoProjeto,
  normalizeCep,
  normalizeCpf,
  normalizePhone,
  normalizeUf,
  whatsappUrl,
} from "@/lib/normalize";

describe("normalize", () => {
  it("CPF com zero à esquerda e máscara", () => {
    expect(normalizeCpf("123.456.789-0")).toBe("01234567890");
    expect(formatCpfDisplay("52998224725")).toBe("529.982.247-25");
  });

  it("telefone remove DDI 55", () => {
    expect(normalizePhone("5531988519092")).toBe("31988519092");
    expect(formatPhoneDisplay("31988519092")).toBe("(31) 98851-9092");
    expect(whatsappUrl("31988519092")).toBe("https://wa.me/5531988519092");
  });

  it("CEP e UF", () => {
    expect(normalizeCep("30.575-190")).toBe("30575190");
    expect(normalizeUf("mg")).toBe("MG");
    expect(digitsOnly("a1b2")).toBe("12");
  });

  it("extrai ano do projeto", () => {
    expect(extractProjectYear("Movimenta Cultura - 2ª Edição 2025")).toBe("2025");
    expect(normalizeAnoProjeto("Edital 2024")).toBe("2024");
  });
});
