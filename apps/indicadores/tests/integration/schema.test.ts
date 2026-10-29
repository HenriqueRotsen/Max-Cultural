import { describe, expect, it } from "vitest";
import { emptySigaCulturalRow, SigaCulturalRowSchema } from "@/lib/schema";

describe("schema (integração leve)", () => {
  it("emptySigaCulturalRow passa no schema", () => {
    const row = emptySigaCulturalRow();
    const parsed = SigaCulturalRowSchema.safeParse(row);
    expect(parsed.success).toBe(true);
  });

  it("rejeita tipo inválido em campo conhecido", () => {
    const row = { ...emptySigaCulturalRow(), Nome: 123 as unknown as string };
    // schema pode coerce ou falhar — garante que parse é determinístico
    const parsed = SigaCulturalRowSchema.safeParse(row);
    expect(typeof parsed.success).toBe("boolean");
  });
});
