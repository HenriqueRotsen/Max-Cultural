import { describe, expect, it } from "vitest";
import {
  andSocioCohort,
  parseSocioCohort,
  socioCohortWhere,
} from "@/lib/socio";

describe("socio cohort", () => {
  it("parseia query", () => {
    expect(parseSocioCohort("selecionados")).toBe("selecionados");
    expect(parseSocioCohort("certificados")).toBe("certificados");
    expect(parseSocioCohort("inscritos")).toBe("inscritos");
    expect(parseSocioCohort(undefined)).toBe("inscritos");
  });

  it("where de selecionados/certificados", () => {
    expect(socioCohortWhere("inscritos")).toEqual({});
    expect(socioCohortWhere("selecionados")).toEqual({
      selecionados: { gt: 0 },
    });
    expect(socioCohortWhere("certificados")).toEqual({
      certificado: { gt: 0 },
    });
  });

  it("combina com filtro existente", () => {
    expect(andSocioCohort({ idProjeto: "1" }, "certificados")).toEqual({
      AND: [{ idProjeto: "1" }, { certificado: { gt: 0 } }],
    });
    expect(andSocioCohort({ idProjeto: "1" }, "inscritos")).toEqual({
      idProjeto: "1",
    });
  });
});
