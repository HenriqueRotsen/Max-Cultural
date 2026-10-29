import { describe, expect, it } from "vitest";
import { emptySigaCulturalRow } from "@/lib/schema";
import { validateRowFields } from "@/lib/validate";
import { validateStrongPassword } from "@/lib/password";

describe("validate + password", () => {
  it("valida campos da inscrição", () => {
    const row = emptySigaCulturalRow();
    row.Nome = "A";
    row.CPF = "111";
    row["E-mail"] = "nao-email";
    row.Telefone = "123";
    row.CEP = "123";
    const issues = validateRowFields(row);
    const cols = issues.map((i) => i.column);
    expect(cols).toContain("Nome");
    expect(cols).toContain("CPF");
    expect(cols).toContain("E-mail");
    expect(cols).toContain("Telefone");
    expect(cols).toContain("CEP");
  });

  it("aceita linha limpa", () => {
    const row = emptySigaCulturalRow();
    row.Nome = "Ana Silva";
    row.CPF = "52998224725";
    row["E-mail"] = "ana@example.com";
    row.Telefone = "31988519092";
    row.CEP = "30575190";
    expect(validateRowFields(row)).toEqual([]);
  });

  it("senha forte do fluxo", () => {
    expect(validateStrongPassword("SenhaForte1!").ok).toBe(true);
    expect(
      validateStrongPassword("SenhaForte1!", { provisional: "SenhaForte1!" }).ok,
    ).toBe(false);
  });
});
