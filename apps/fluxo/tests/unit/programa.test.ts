import { describe, expect, it } from "vitest";
import {
  extractEdicaoNumero,
  programaDisplayName,
  programaStem,
} from "@/lib/programa";

describe("programa", () => {
  it("gera stem ignorando edição e parênteses", () => {
    expect(programaStem("Arte em cores - 3ª edição (modo virtual)")).toBe(
      "arte-em-cores",
    );
  });

  it("display name capitalizado", () => {
    expect(programaDisplayName("Arte em cores - 3ª edição")).toBe("Arte Em Cores");
  });

  it("extrai número da edição", () => {
    expect(extractEdicaoNumero("Movimenta - 2ª edição")).toBe(2);
    expect(extractEdicaoNumero("Oficina sem marcador")).toBeNull();
  });
});
