import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeContinueUrl } from "@max/auth";

describe("safeContinueUrl (redirect após login)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ORIGEM_URL", "https://origem.maxcultural.com.br");
    vi.stubEnv("NEXT_PUBLIC_AUDITORIA_URL", "http://localhost:3003");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("aceita caminho relativo e apps conhecidos", () => {
    expect(safeContinueUrl("/inicio")).toBe("/inicio");
    expect(safeContinueUrl("https://origem.maxcultural.com.br/planejamento")).toBe(
      "https://origem.maxcultural.com.br/planejamento",
    );
    expect(safeContinueUrl("http://localhost:3003/inicio")).toBe("http://localhost:3003/inicio");
    expect(safeContinueUrl("https://auditoria.maxcultural.com.br/inicio")).toBe(
      "https://auditoria.maxcultural.com.br/inicio",
    );
  });

  it("recusa domínio que só começa igual a um app conhecido", () => {
    expect(safeContinueUrl("https://origem.maxcultural.com.br.evil.com/x", "/")).toBe("/");
    expect(safeContinueUrl("http://localhost:3003.evil.com/x", "/")).toBe("/");
  });

  it("recusa domínio que só termina com maxcultural.com.br", () => {
    expect(safeContinueUrl("https://evilmaxcultural.com.br/x", "/")).toBe("/");
  });

  it("recusa protocolo relativo, javascript: e http em subdomínio", () => {
    expect(safeContinueUrl("//evil.com", "/")).toBe("/");
    expect(safeContinueUrl("javascript:alert(1)", "/")).toBe("/");
    expect(safeContinueUrl("http://auditoria.maxcultural.com.br/inicio", "/")).toBe("/");
  });
});
