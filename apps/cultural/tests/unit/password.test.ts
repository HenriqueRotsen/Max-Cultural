import { describe, expect, it } from "vitest";
import {
  generateProvisionalPassword,
  hashPassword,
  hashToken,
  randomToken,
  validateStrongPassword,
  verifyPassword,
} from "@/lib/password";

describe("password", () => {
  it("rejeita senha fraca", () => {
    expect(validateStrongPassword("curta").ok).toBe(false);
    expect(validateStrongPassword("semdigitoAAAA!").ok).toBe(false);
    expect(validateStrongPassword("SemSimbolo1234").ok).toBe(false);
  });

  it("aceita senha forte e bloqueia e-mail na senha", () => {
    expect(validateStrongPassword("SenhaForte1!").ok).toBe(true);
    expect(
      validateStrongPassword("henriqueForte1!", { email: "henrique@example.com" })
        .ok,
    ).toBe(false);
  });

  it("gera provisória com comprimento e charset básicos", () => {
    const provisional = generateProvisionalPassword(16);
    expect(provisional.length).toBe(16);
    expect(/[a-z]/.test(provisional)).toBe(true);
    expect(/[A-Z]/.test(provisional)).toBe(true);
    expect(/\d/.test(provisional)).toBe(true);
    expect(/[^A-Za-z0-9]/.test(provisional)).toBe(true);
  });

  it("hash/verify roundtrip", async () => {
    const hash = await hashPassword("SenhaForte1!");
    expect(await verifyPassword("SenhaForte1!", hash)).toBe(true);
    expect(await verifyPassword("outra", hash)).toBe(false);
  });

  it("hashToken é determinístico e randomToken varia", async () => {
    expect(await hashToken("abc")).toBe(await hashToken("abc"));
    expect(randomToken(8)).not.toBe(randomToken(8));
  });
});
