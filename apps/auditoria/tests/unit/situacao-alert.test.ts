import { describe, expect, it } from "vitest";
import { decideSituacaoChange } from "@/lib/alerts/diligencia";
import { hubUserCanEnterAuditoria } from "@/lib/alerts/recipients";

describe("aviso de mudança de situação", () => {
  it("avisa sempre que a situação muda", () => {
    expect(decideSituacaoChange("E10-Autorizada a captação total", "E12-Autorizada a captação parcial")).toEqual({
      alert: "SITUACAO",
      exitedDiligencia: false,
    });
    expect(decideSituacaoChange("E19-Prestação de Contas Aprovada", "A42-Arquivado")).toMatchObject({ alert: "SITUACAO" });
  });

  it("não avisa quando a situação é a mesma (ignora caixa e espaços)", () => {
    expect(decideSituacaoChange("E10-Autorizada", " e10-autorizada ")).toEqual({ alert: null, exitedDiligencia: false });
    expect(decideSituacaoChange("E10-Autorizada", null)).toEqual({ alert: null, exitedDiligencia: false });
  });

  it("entrar em diligência gera o aviso de Diligência", () => {
    expect(decideSituacaoChange("E10-Autorizada", "Projeto em diligência")).toEqual({
      alert: "DILIGENCIA",
      exitedDiligencia: false,
    });
  });

  it("sair de diligência também avisa e marca a saída", () => {
    expect(decideSituacaoChange("Projeto em diligência", "E12-Autorizada")).toEqual({
      alert: "SITUACAO",
      exitedDiligencia: true,
    });
  });

  it("projeto novo no espelho só avisa se já chega em diligência", () => {
    expect(decideSituacaoChange(null, "E10-Autorizada")).toEqual({ alert: null, exitedDiligencia: false });
    expect(decideSituacaoChange(undefined, "Projeto em diligência")).toMatchObject({ alert: "DILIGENCIA" });
  });
});

describe("quem recebe o aviso", () => {
  const base = { id: "u", email: "a@x.com", isSuperAdmin: false, rolePermissions: [], overrides: [] };
  it("quem entra na Auditoria pelo papel, por GRANT ou é superadmin", () => {
    expect(
      hubUserCanEnterAuditoria({ ...base, rolePermissions: [{ screen: "auditoria.app", canView: true, canEdit: false }] }),
    ).toBe(true);
    expect(
      hubUserCanEnterAuditoria({
        ...base,
        rolePermissions: [{ screen: "financeiro.auditoria", canView: true, canEdit: false }],
      }),
    ).toBe(true);
    expect(hubUserCanEnterAuditoria({ ...base, overrides: [{ screen: "auditoria.app", effect: "GRANT" }] })).toBe(true);
    expect(hubUserCanEnterAuditoria({ ...base, isSuperAdmin: true })).toBe(true);
  });
  it("fica de fora quem não tem acesso ou teve o acesso negado", () => {
    expect(hubUserCanEnterAuditoria(base)).toBe(false);
    expect(
      hubUserCanEnterAuditoria({
        ...base,
        rolePermissions: [{ screen: "auditoria.app", canView: true, canEdit: false }],
        overrides: [{ screen: "auditoria.app", effect: "DENY" }],
      }),
    ).toBe(false);
  });
});
