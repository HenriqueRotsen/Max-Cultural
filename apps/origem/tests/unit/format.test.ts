import { describe, expect, it } from "vitest";
import {
  formatBrMoney,
  formatCgccpfInput,
  isValidCnpj,
  isValidCpf,
  normalizeCgccpf,
  parseBrMoney,
} from "@/lib/format";

describe("format — documentos", () => {
  it("normaliza CPF/CNPJ removendo máscara", () => {
    expect(normalizeCgccpf("529.982.247-25")).toBe("52998224725");
    expect(normalizeCgccpf("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("valida CPF conhecido", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("valida CNPJ conhecido", () => {
    expect(isValidCnpj("04.252.011/0001-10")).toBe(true);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
  });

  it("aplica máscara progressiva", () => {
    expect(formatCgccpfInput("52998224725")).toBe("529.982.247-25");
    expect(formatCgccpfInput("04252011000110")).toBe("04.252.011/0001-10");
  });
});

describe("format — dinheiro BR", () => {
  it("parseia formatos comuns", () => {
    expect(parseBrMoney("1.234,56")).toBe(1234.56);
    expect(parseBrMoney("1234,56")).toBe(1234.56);
    expect(parseBrMoney("1234.56")).toBe(1234.56);
    expect(parseBrMoney("")).toBeNull();
    expect(parseBrMoney("abc")).toBeNull();
  });

  it("formata sem símbolo", () => {
    expect(formatBrMoney(1234.5)).toBe("1.234,50");
    expect(formatBrMoney(null)).toBe("");
  });
});
