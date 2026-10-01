import { describe, expect, it } from "vitest";
import {
  birthYearBounds,
  digitsOnly,
  extractProjectYear,
  formatCpfDisplay,
  formatDateBR,
  formatPhoneDisplay,
  normalizeAnoProjeto,
  normalizeCep,
  normalizeCpf,
  normalizePhone,
  normalizeRow,
  normalizeUf,
  parseBirthDate,
  parseFlexibleDate,
  whatsappUrl,
} from "@/lib/normalize";
import { validateRowFields } from "@/lib/validate";

describe("normalize", () => {
  it("CPF com zero à esquerda e máscara", () => {
    expect(normalizeCpf("123.456.789-0")).toBe("01234567890");
    expect(normalizeCpf("5299822472")).toBe("05299822472");
    expect(normalizeCpf("123456789")).toBe("00123456789");
    expect(formatCpfDisplay("52998224725")).toBe("529.982.247-25");
  });

  it("telefone remove DDI 55 e zero de troncal", () => {
    expect(normalizePhone("5531988519092")).toBe("31988519092");
    expect(normalizePhone("031988519092")).toBe("31988519092");
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

  it("formata datas BR com e sem separadores / ano curto", () => {
    const cases: Array<[string, string]> = [
      ["04/02/2001", "04/02/2001"],
      ["4/2/2001", "04/02/2001"],
      ["4/2/01", "04/02/2001"],
      ["04/2/01", "04/02/2001"],
      ["04022001", "04/02/2001"],
      ["040201", "04/02/2001"],
      ["40201", "04/02/2001"],
      ["04.02.2001", "04/02/2001"],
      ["4-2-2001", "04/02/2001"],
    ];
    for (const [input, expected] of cases) {
      expect(formatDateBR(parseFlexibleDate(input))).toBe(expected);
      expect(formatDateBR(parseBirthDate(input))).toBe(expected);
    }
  });

  it("nascimento exige ano com 4 dígitos entre atual−100 e atual−17", () => {
    const ref = new Date(2026, 8, 28);
    const { min, max } = birthYearBounds(ref);
    expect(min).toBe(1926);
    expect(max).toBe(2009);

    expect(formatDateBR(parseBirthDate(`04/02/${max}`, ref))).toBe(`04/02/${max}`);
    expect(formatDateBR(parseBirthDate(`04/02/${min}`, ref))).toBe(`04/02/${min}`);
    expect(parseBirthDate(`04/02/${max + 1}`, ref)).toBeNull(); // < 17 anos
    expect(parseBirthDate(`04/02/${min - 1}`, ref)).toBeNull(); // > 100 anos

    const young = normalizeRow({
      Nome: "Ana Silva",
      CPF: "52998224725",
      Data_nascimento: "04/02/2015",
    } as never);
    expect(young.Data_nascimento).toBe("");

    const old = normalizeRow({
      Nome: "Ana Silva",
      CPF: "52998224725",
      Data_nascimento: "04/02/1900",
    } as never);
    expect(old.Data_nascimento).toBe("");
  });

  it("nascimento sem ano fica em branco (sem erro)", () => {
    for (const input of ["04/02", "4/2", "4-2", "0402", "4.2"]) {
      expect(parseFlexibleDate(input)).toBeNull();
      expect(parseBirthDate(input)).toBeNull();
    }
    const row = normalizeRow({
      Nome: "Ana Silva",
      CPF: "529.982.247-25",
      Data_nascimento: "04/02",
      Telefone: "(31) 98851-9092",
    } as never);
    expect(row.Data_nascimento).toBe("");
    expect(row.CPF).toBe("52998224725");
    expect(row.Telefone).toBe("31988519092");
    expect(validateRowFields(row)).toEqual([]);
  });

  it("nascimento inválido também zera o campo", () => {
    const row = normalizeRow({
      Nome: "Ana Silva",
      CPF: "52998224725",
      Data_nascimento: "não tem",
    } as never);
    expect(row.Data_nascimento).toBe("");
  });

  it("carimbo data/hora vira Data_inscricao (só a data)", () => {
    expect(formatDateBR(parseFlexibleDate("28/09/2026 14:32:10"))).toBe(
      "28/09/2026",
    );
    expect(formatDateBR(parseFlexibleDate("9/28/2026 2:32:10 PM"))).toBe(
      "28/09/2026",
    );
    const row = normalizeRow({
      Nome: "Ana Silva",
      CPF: "52998224725",
      Data_nascimento: "04/02/2001",
      Data_inscricao: "28/09/2026 14:32:10",
    } as never);
    expect(row.Data_inscricao).toBe("28/09/2026");
  });
});
