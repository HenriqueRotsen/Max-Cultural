import { describe, expect, it } from "vitest";
import {
  enderecoLabel,
  formatarNumero,
  mapaProdutoDaAcao,
  diasDaExecucao,
  gruposDoPerfil,
  mesesDoPeriodo,
  minutosDoHorario,
  sugerir,
  type ContextoSugestao,
  minutosEmHoras,
  normalizarValor,
  preenchido,
  progressoEquipe,
  type CampoPrestacao,
} from "@/lib/prestacao/regras";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function campo(p: Partial<CampoPrestacao> & Pick<CampoPrestacao, "chave">): CampoPrestacao {
  return { rotulo: p.chave, tipo: "TEXTO", opcoes: [], equipe: "PRODUCAO", obrigatorio: false, ativo: true, ...p };
}

describe("preenchimento", () => {
  it("valor ou 'não se aplica' contam como preenchido", () => {
    expect(preenchido({ v: "x" })).toBe(true);
    expect(preenchido({ v: 0 })).toBe(true);
    expect(preenchido({ na: true })).toBe(true);
    expect(preenchido({ v: "  " })).toBe(false);
    expect(preenchido(undefined)).toBe(false);
  });

  it("percentual por equipe, obrigatórios primeiro nos que faltam", () => {
    const campos = [
      campo({ chave: "a" }),
      campo({ chave: "b", obrigatorio: true }),
      campo({ chave: "c", na: undefined } as never),
      campo({ chave: "d", equipe: "GESTAO" }),
      campo({ chave: "e", ativo: false }),
    ];
    const p = progressoEquipe(campos, { a: { v: "ok" } }, "PRODUCAO");
    expect(p).toEqual({ preenchidos: 1, total: 3, pct: 33, faltando: ["b", "c"] });
    expect(progressoEquipe(campos, {}, "COMUNICACAO").pct).toBe(100);
  });
});

describe("normalizarValor", () => {
  it("valida por tipo", () => {
    expect(normalizarValor({ tipo: "NUMERO", opcoes: [], rotulo: "Vagas" }, "1.250")).toEqual({ ok: true, valor: 1250 });
    expect(normalizarValor({ tipo: "NUMERO", opcoes: [], rotulo: "Vagas" }, "abc").ok).toBe(false);
    expect(normalizarValor({ tipo: "LINK", opcoes: [], rotulo: "Release" }, "drive.google.com/x").ok).toBe(false);
    expect(normalizarValor({ tipo: "LINK", opcoes: [], rotulo: "Release" }, "https://drive.google.com/x")).toEqual({
      ok: true,
      valor: "https://drive.google.com/x",
    });
    expect(normalizarValor({ tipo: "OPCOES", opcoes: ["Realizada"], rotulo: "Status" }, "Feita").ok).toBe(false);
    expect(normalizarValor({ tipo: "SIM_NAO", opcoes: [], rotulo: "Conta" }, "Sim")).toEqual({ ok: true, valor: "Sim" });
    expect(normalizarValor({ tipo: "TEXTO", opcoes: [], rotulo: "x" }, "   ")).toEqual({ ok: true, valor: null });
  });
});

describe("dados do período", () => {
  it("meses do período e quantidade", () => {
    expect(mesesDoPeriodo(d("2026-11-09"), d("2026-11-11"))).toEqual({ rotulo: "novembro/2026", quantidade: 1 });
    expect(mesesDoPeriodo(d("2026-11-20"), d("2027-01-10"))).toEqual({
      rotulo: "novembro/2026 a janeiro/2027",
      quantidade: 3,
    });
    expect(mesesDoPeriodo(d("2026-11-20"), null).quantidade).toBe(1);
  });

  it("minutos em horas", () => {
    expect(minutosEmHoras(90)).toBe("1h30");
    expect(minutosEmHoras(240)).toBe("4h");
    expect(minutosEmHoras(0)).toBe("");
  });
});

describe("campos inteligentes", () => {
  it("valida várias opções, horário e link do Instagram", () => {
    const multi = { tipo: "MULTIPLA" as const, opcoes: ["Jovens", "Mulheres"], rotulo: "Grupos" };
    expect(normalizarValor(multi, JSON.stringify(["Jovens", "Inventado"]))).toEqual({ ok: true, valor: ["Jovens"] });
    expect(normalizarValor(multi, "[]")).toEqual({ ok: true, valor: null });
    const hora = { tipo: "HORARIO" as const, opcoes: [], rotulo: "Horário" };
    expect(normalizarValor(hora, "14:00-17:00")).toEqual({ ok: true, valor: "14:00-17:00" });
    expect(normalizarValor(hora, "17:00-14:00").ok).toBe(false);
    const insta = { tipo: "LINK" as const, opcoes: [], rotulo: "Instagram", chave: "instagram" };
    expect(normalizarValor(insta, "https://drive.google.com/x").ok).toBe(false);
    expect(normalizarValor(insta, "https://www.instagram.com/p/abc/").ok).toBe(true);
  });

  it("carga horária pelo horário × dias", () => {
    expect(minutosDoHorario("14:00-17:30")).toBe(210);
    expect(minutosDoHorario("x")).toBeNull();
    expect(diasDaExecucao(d("2026-11-23"), d("2026-11-25"))).toBe(3);
    expect(diasDaExecucao(d("2026-11-23"), null)).toBe(1);
  });

  it("grupos atendidos pelo perfil das inscrições", () => {
    expect(
      gruposDoPerfil({
        total: 10,
        genero: { Feminino: 6, Masculino: 4 },
        etnia: { Preta: 3, Parda: 3, Branca: 4 },
        idade: { "15–17": 4, "18–29": 3, "30–44": 3 },
        pcd: 1,
      }),
    ).toEqual(["Crianças e adolescentes", "Jovens", "Mulheres", "Pessoas negras", "Pessoas com deficiência"]);
    expect(gruposDoPerfil({ total: 0, genero: {}, etnia: {}, idade: {}, pcd: 0 })).toEqual([]);
  });

  it("sugere status pela data, público, carga horária e professor", () => {
    const ctx: ContextoSugestao = {
      hoje: d("2026-11-26"),
      inicio: d("2026-11-23"),
      fim: d("2026-11-25"),
      participantes: 14,
      responsaveis: ["Ana Souza"],
      historico: ["João Lima"],
      perfil: null,
      horario: "14:00-17:00",
    };
    const op = { opcoes: ["Confirmada", "Agendada", "Realizada"] };
    expect(sugerir({ sugestao: "STATUS_DATA", tipo: "OPCOES", ...op }, ctx)?.valor).toBe("Realizada");
    expect(sugerir({ sugestao: "STATUS_DATA", tipo: "OPCOES", ...op }, { ...ctx, hoje: d("2026-11-20") })?.valor).toBe("Agendada");
    expect(sugerir({ sugestao: "PARTICIPANTES", tipo: "NUMERO", opcoes: [] }, ctx)?.valor).toBe(14);
    const carga = sugerir({ sugestao: "CARGA_HORARIA", tipo: "NUMERO", opcoes: [] }, ctx);
    expect(carga).toMatchObject({ valor: 540, motivo: "3h por dia × 3 dias" });
    expect(sugerir({ sugestao: "RESPONSAVEIS", tipo: "TEXTO", opcoes: [] }, ctx)).toMatchObject({
      valor: "Ana Souza",
      alternativas: ["Ana Souza", "João Lima"],
    });
    expect(sugerir({ sugestao: null, tipo: "TEXTO", opcoes: [] }, ctx)).toBeNull();
  });
});

describe("pessoas, local e números", () => {
  it("vários nomes, sem repetir", () => {
    const c = { tipo: "PESSOAS" as const, opcoes: [], rotulo: "Professores" };
    expect(normalizarValor(c, JSON.stringify([" Ana  Souza", "Ana Souza", "João"]))).toEqual({ ok: true, valor: ["Ana Souza", "João"] });
    expect(normalizarValor(c, "Maria")).toEqual({ ok: true, valor: ["Maria"] });
  });

  it("endereço: CEP formatado, UF em maiúsculas, rótulo legível", () => {
    const c = { tipo: "ENDERECO" as const, opcoes: [], rotulo: "Local" };
    const r = normalizarValor(c, JSON.stringify({ nome: "Escola X", cep: "30140000", logradouro: "Rua A", numero: "12", cidade: "Belo Horizonte", uf: "mg" }));
    expect(r).toEqual({ ok: true, valor: { nome: "Escola X", cep: "30140-000", logradouro: "Rua A", numero: "12", cidade: "Belo Horizonte", uf: "MG" } });
    expect(normalizarValor(c, JSON.stringify({ cep: "123" })).ok).toBe(false);
    expect(normalizarValor(c, JSON.stringify({ cidade: "BH" }))).toEqual({ ok: true, valor: null });
    expect(enderecoLabel({ nome: "Escola X", logradouro: "Rua A", numero: "12", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG", cep: "30140-000" })).toBe(
      "Escola X — Rua A, 12 - Centro, Belo Horizonte/MG · CEP 30140-000",
    );
  });

  it("números inteiros formatados", () => {
    expect(formatarNumero(1250)).toBe("1.250");
    expect(normalizarValor({ tipo: "NUMERO", opcoes: [], rotulo: "x" }, "1.250")).toEqual({ ok: true, valor: 1250 });
  });

  it("sugere responsáveis para vários nomes e o local já usado", () => {
    const base: ContextoSugestao = {
      hoje: d("2026-11-26"),
      inicio: d("2026-11-23"),
      fim: null,
      participantes: 0,
      responsaveis: ["Ana Souza", "Bia Lima"],
      historico: ["João"],
      perfil: null,
      horario: "",
      locais: [],
      cidade: "Belo Horizonte",
      uf: "MG",
    };
    expect(sugerir({ sugestao: "RESPONSAVEIS", tipo: "PESSOAS", opcoes: [] }, base)?.valor).toEqual(["Ana Souza", "Bia Lima"]);
    expect(sugerir({ sugestao: "LOCAL", tipo: "ENDERECO", opcoes: [] }, base)?.valor).toEqual({ cidade: "Belo Horizonte", uf: "MG" });
    const comLocal = { ...base, locais: [{ nome: "Escola X", logradouro: "Rua A" }] };
    expect(sugerir({ sugestao: "LOCAL", tipo: "ENDERECO", opcoes: [] }, comLocal)?.valor).toEqual({ nome: "Escola X", logradouro: "Rua A" });
  });
});

describe("produto da ação", () => {
  it("cada ação no primeiro produto que a inclui", () => {
    const m = mapaProdutoDaAcao([
      { id: "p1", acaoIds: ["a1", "a2"] },
      { id: "p2", acaoIds: ["a2", "a3"] },
    ]);
    expect([...m]).toEqual([
      ["a1", "p1"],
      ["a2", "p1"],
      ["a3", "p2"],
    ]);
  });
});
