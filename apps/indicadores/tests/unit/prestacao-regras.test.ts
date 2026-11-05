import { describe, expect, it } from "vitest";
import {
  mesesDoPeriodo,
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
