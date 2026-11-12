import { describe, expect, it } from "vitest";
import {
  cnpjsInText,
  readBoletoLine,
  salicTipoForSupport,
  sortSupportDocs,
  supportNumberFromText,
} from "@/lib/planning/support-docs";

describe("readBoletoLine", () => {
  it("lê valor e vencimento da linha digitável (fator do ciclo novo)", () => {
    // fator 1000 = 22/02/2025; valor R$ 1.234,56
    const line = "00190.00009 01234.567004 00000.000000 1 10000000123456";
    const info = readBoletoLine(`Pague até o vencimento ${line} Banco do Brasil`);
    expect(info?.amount).toBe(1234.56);
    expect(info?.dueDate).toBe("2025-02-22");
  });
  it("sem linha digitável, nada", () => {
    expect(readBoletoLine("Apólice nº 123 valor R$ 500,00")).toBeNull();
  });
});

describe("supportNumberFromText", () => {
  it("acha o número da apólice e do contrato", () => {
    expect(supportNumberFromText("APOLICE", "Apólice nº 1007500012345 vigência")).toBe("1007500012345");
    expect(supportNumberFromText("CONTRATO", "CONTRATO Nº 045/2026 de locação")).toBe("045/2026");
    expect(supportNumberFromText("CONTRATO", "Contrato de locação de andaime")).toBeNull();
  });
});

describe("cnpjsInText", () => {
  it("lista os CNPJs do texto", () => {
    expect(cnpjsInText("Locador 36.498.130/0001-43 e locatário 11222333000181")).toEqual([
      "36498130000143",
      "11222333000181",
    ]);
  });
});

describe("ordem e tipo no SALIC", () => {
  it("contrato e apólice antes do boleto", () => {
    expect(
      sortSupportDocs([{ supportType: "BOLETO" }, { supportType: "APOLICE" }, { supportType: "CONTRATO" }]).map(
        (d) => d.supportType,
      ),
    ).toEqual(["CONTRATO", "APOLICE", "BOLETO"]);
  });
  it("fatura vira nota fiscal/fatura; o resto, recibo", () => {
    expect(salicTipoForSupport(["BOLETO", "FATURA"])).toBe(3);
    expect(salicTipoForSupport(["APOLICE", "BOLETO"])).toBe(4);
    expect(salicTipoForSupport([])).toBeNull();
  });
});
