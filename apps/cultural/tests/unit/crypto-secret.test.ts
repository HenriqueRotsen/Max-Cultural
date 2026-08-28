import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto-secret";

describe("crypto-secret", () => {
  afterEach(() => {
    delete process.env.CREDENTIALS_SECRET;
    delete process.env.AUTH_SECRET;
  });

  it("exige secret configurado", async () => {
    delete process.env.CREDENTIALS_SECRET;
    delete process.env.AUTH_SECRET;
    await expect(encryptSecret("x")).rejects.toThrow(/CREDENTIALS_SECRET/);
  });

  it("encrypt/decrypt roundtrip", async () => {
    process.env.CREDENTIALS_SECRET = "test-secret-for-unit-tests-only";
    const enc = await encryptSecret("senha-secreta");
    expect(enc).toContain(":");
    expect(await decryptSecret(enc)).toBe("senha-secreta");
  });

  it("rejeita payload inválido", async () => {
    process.env.CREDENTIALS_SECRET = "test-secret-for-unit-tests-only";
    await expect(decryptSecret("quebrado")).rejects.toThrow(/inválido/i);
  });
});
