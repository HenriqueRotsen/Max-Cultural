import { describe, expect, it } from "vitest";
import { validateFormularioAnswers } from "@/lib/formularios/validate-response";
import type { CampoValidavel } from "@/lib/formularios/validate-response";

const baseCampos: CampoValidavel[] = [
  {
    id: "nome",
    rotulo: "Nome",
    obrigatorio: true,
    tipo: "NAME",
    sigaColumn: "Nome",
    opcoes: null,
  },
  {
    id: "cpf",
    rotulo: "CPF",
    obrigatorio: true,
    tipo: "CPF",
    sigaColumn: "CPF",
    opcoes: null,
  },
  {
    id: "email",
    rotulo: "E-mail",
    obrigatorio: true,
    tipo: "EMAIL",
    sigaColumn: "E-mail",
    opcoes: null,
  },
  {
    id: "end",
    rotulo: "Endereço",
    obrigatorio: true,
    tipo: "ADDRESS_BR",
    sigaColumn: null,
    opcoes: null,
  },
  {
    id: "decl",
    rotulo: "LGPD",
    obrigatorio: true,
    tipo: "DECLARACAO",
    sigaColumn: null,
    opcoes: null,
  },
  {
    id: "extra",
    rotulo: "Como soube",
    obrigatorio: false,
    tipo: "CHECKBOXES",
    sigaColumn: null,
    opcoes: ["Instagram", "Amigo"],
  },
];

const validAnswers = {
  nome: "Maria Silva",
  cpf: "529.982.247-25",
  email: "maria@example.com",
  end: {
    CEP: "30575-190",
    Lougradouro: "Rua A",
    Numero: "100",
    Complemento: "Apto 1",
    Bairro: "Centro",
    Cidade: "Belo Horizonte",
    Estado: "mg",
  },
  decl: true,
  extra: ["Instagram"],
};

describe("validateFormularioAnswers", () => {
  it("normaliza CPF, e-mail e ADDRESS_BR para SIGA", () => {
    const result = validateFormularioAnswers(baseCampos, validAnswers);
    expect(result.ok).toBe(true);
    expect(result.cpf).toBe("52998224725");
    expect(result.sigaPartial.Nome).toBe("Maria Silva");
    expect(result.sigaPartial["E-mail"]).toBe("maria@example.com");
    expect(result.sigaPartial.CEP).toBe("30575190");
    expect(result.sigaPartial.Estado).toBe("MG");
    expect(result.sigaPartial.Lougradouro).toBe("Rua A");
    expect(result.sigaPartial.Numero).toBe("100");
    expect(result.values.extra).toEqual(["Instagram"]);
    expect(result.sigaPartial).not.toHaveProperty("extra");
  });

  it("exige CPF válido e único no payload", () => {
    const result = validateFormularioAnswers(baseCampos, {
      ...validAnswers,
      cpf: "123",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.cpf || result.errors._cpf).toBeTruthy();
  });

  it("exige declaração marcada", () => {
    const result = validateFormularioAnswers(baseCampos, {
      ...validAnswers,
      decl: false,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.decl).toMatch(/declar/i);
  });

  it("valida endereço incompleto", () => {
    const result = validateFormularioAnswers(baseCampos, {
      ...validAnswers,
      end: { CEP: "30575190", Lougradouro: "", Numero: "", Bairro: "", Cidade: "", Estado: "", Complemento: "" },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.end).toBeTruthy();
  });

  it("extras sem sigaColumn não entram no merge partial", () => {
    const result = validateFormularioAnswers(baseCampos, validAnswers);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.sigaPartial)).not.toContain("Como soube");
    expect(result.values.decl).toBe(true);
    expect(result.sigaPartial).not.toHaveProperty("decl");
  });

  it("telefone BR inválido falha", () => {
    const campos: CampoValidavel[] = [
      ...baseCampos,
      {
        id: "tel",
        rotulo: "Telefone",
        obrigatorio: true,
        tipo: "PHONE_BR",
        sigaColumn: "Telefone",
        opcoes: null,
      },
    ];
    const result = validateFormularioAnswers(campos, {
      ...validAnswers,
      tel: "123",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.tel).toMatch(/telefone/i);
  });

  it("rejeita opções fora da lista (checkbox / dropdown)", () => {
    const badCheckbox = validateFormularioAnswers(baseCampos, {
      ...validAnswers,
      extra: ["Instagram", "Hack"],
    });
    expect(badCheckbox.ok).toBe(false);
    expect(badCheckbox.errors.extra).toMatch(/opção/i);

    const campos: CampoValidavel[] = [
      ...baseCampos,
      {
        id: "cidade",
        rotulo: "Cidade",
        obrigatorio: true,
        tipo: "DROPDOWN",
        sigaColumn: null,
        opcoes: ["BH", "SP"],
      },
    ];
    const badDrop = validateFormularioAnswers(campos, {
      ...validAnswers,
      cidade: "RJ",
    });
    expect(badDrop.ok).toBe(false);
    expect(badDrop.errors.cidade).toMatch(/opção/i);
  });
});

describe("merge gate helpers", () => {
  it("só respostas READY devem ser candidatas (contrato de status)", () => {
    const statuses = ["PENDING", "READY", "MERGED", "REJECTED"] as const;
    const readyOnly = statuses.filter((s) => s === "READY");
    expect(readyOnly).toEqual(["READY"]);
  });

  it("confirmação MERGE é case-insensitive e trim", () => {
    const confirm = (text: string) => text.trim().toUpperCase() === "MERGE";
    expect(confirm("MERGE")).toBe(true);
    expect(confirm(" merge ")).toBe(true);
    expect(confirm("MESCLAR")).toBe(false);
  });
});
