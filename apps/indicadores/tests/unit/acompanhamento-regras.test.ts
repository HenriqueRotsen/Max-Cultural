import { describe, expect, it } from "vitest";
import {
  calcularPrazo,
  chaveTarefa,
  diaEmBrasilia,
  diasAposPrazo,
  gerarTarefas,
  pedeAtencao,
  percentualConcluido,
  statusGestao,
  tarefasFaltantes,
  type ModeloTarefa,
} from "@/lib/acompanhamento/regras";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

function modelo(p: Partial<ModeloTarefa> & Pick<ModeloTarefa, "id" | "unidade">): ModeloTarefa {
  return {
    area: "COMUNICACAO",
    nivel: p.unidade === "PROJETO" ? 1 : 2,
    fase: p.unidade === "PROJETO" ? "PLANEJAMENTO" : "ANTES",
    titulo: p.id,
    detalhamento: "",
    prazoBase: p.unidade === "PROJETO" ? "INICIO_EXECUCAO" : "INICIO_ACAO",
    prazoDias: 0,
    tiposAcao: [],
    ordem: 0,
    ativo: true,
    ...p,
  };
}

const datas = { inicioExecucao: d("2026-03-01"), fimExecucao: d("2026-12-31") };

describe("calcularPrazo", () => {
  it("D±N a partir do início/fim da execução do projeto ou da ação", () => {
    const acao = { inicio: d("2026-11-09"), fim: d("2026-11-11") };
    expect(iso(calcularPrazo({ prazoBase: "INICIO_EXECUCAO", prazoDias: 15 }, datas))).toBe("2026-03-16");
    expect(iso(calcularPrazo({ prazoBase: "FIM_EXECUCAO", prazoDias: 30 }, datas))).toBe("2027-01-30");
    expect(iso(calcularPrazo({ prazoBase: "INICIO_ACAO", prazoDias: -7 }, datas, acao))).toBe("2026-11-02");
    expect(iso(calcularPrazo({ prazoBase: "FIM_ACAO", prazoDias: 7 }, datas, acao))).toBe("2026-11-18");
  });

  it("sem base ou sem dias não há prazo", () => {
    expect(calcularPrazo({ prazoBase: null, prazoDias: 3 }, datas)).toBeNull();
    expect(calcularPrazo({ prazoBase: "INICIO_EXECUCAO", prazoDias: null }, datas)).toBeNull();
    expect(calcularPrazo({ prazoBase: "INICIO_EXECUCAO", prazoDias: 5 }, { inicioExecucao: null, fimExecucao: null })).toBeNull();
    expect(calcularPrazo({ prazoBase: "INICIO_ACAO", prazoDias: 5 }, datas, null)).toBeNull();
  });
});

describe("statusGestao", () => {
  const hoje = d("2026-11-05");
  const base = { status: "NAO_INICIADA" as const, recursoLiberado: true, hoje };

  it("em atraso, prazo próximo (≤ 3 dias) e no prazo", () => {
    expect(statusGestao({ ...base, prazo: d("2026-11-04") })).toBe("EM_ATRASO");
    expect(statusGestao({ ...base, prazo: d("2026-11-05") })).toBe("PRAZO_PROXIMO");
    expect(statusGestao({ ...base, prazo: d("2026-11-08") })).toBe("PRAZO_PROXIMO");
    expect(statusGestao({ ...base, prazo: d("2026-11-09") })).toBe("NO_PRAZO");
    expect(statusGestao({ ...base, prazo: null })).toBe("SEM_PRAZO");
  });

  it("concluída e não contemplada vencem o prazo", () => {
    expect(statusGestao({ ...base, status: "CONCLUIDA", prazo: d("2026-01-01") })).toBe("CONCLUIDA");
    expect(statusGestao({ ...base, status: "NAO_CONTEMPLADA", prazo: d("2026-01-01") })).toBe("NAO_CONTEMPLADA");
  });

  it("antes da liberação do recurso nada fica atrasado", () => {
    expect(statusGestao({ ...base, recursoLiberado: false, prazo: d("2026-01-01") })).toBe("AGUARDANDO_LIBERACAO");
  });

  it("pede atenção só em atraso ou prazo próximo", () => {
    expect(pedeAtencao("EM_ATRASO")).toBe(true);
    expect(pedeAtencao("PRAZO_PROXIMO")).toBe(true);
    expect(pedeAtencao("NO_PRAZO")).toBe(false);
    expect(pedeAtencao("AGUARDANDO_LIBERACAO")).toBe(false);
  });
});

describe("conclusão × prazo", () => {
  it("compara o dia (horário de Brasília) da conclusão com o prazo", () => {
    const prazo = d("2026-11-13");
    expect(diasAposPrazo(prazo, new Date("2026-11-15T14:00:00Z"))).toBe(2);
    expect(diasAposPrazo(prazo, new Date("2026-11-10T12:00:00Z"))).toBe(-3);
    // 23h de 13/11 em Brasília já é 14/11 em UTC: continua sendo no dia.
    expect(diasAposPrazo(prazo, new Date("2026-11-14T02:00:00Z"))).toBe(0);
    expect(diasAposPrazo(null, new Date())).toBeNull();
    expect(diasAposPrazo(prazo, null)).toBeNull();
    expect(iso(diaEmBrasilia(new Date("2026-11-14T02:00:00Z")))).toBe("2026-11-13");
  });
});

describe("percentualConcluido", () => {
  it("ignora as não contempladas", () => {
    expect(percentualConcluido(["CONCLUIDA", "NAO_INICIADA", "NAO_CONTEMPLADA", "CONCLUIDA"])).toBe(67);
    expect(percentualConcluido(["NAO_CONTEMPLADA"])).toBe(0);
    expect(percentualConcluido([])).toBe(0);
  });
});

describe("gerarTarefas", () => {
  const acoes = [
    {
      id: "of1",
      tipoId: "oficina",
      agenda: [
        { id: "ag1", cidade: "Januária", uf: "mg", data: d("2026-10-19") },
        { id: "ag2", cidade: "Januaria ", uf: "MG", data: d("2026-11-09") },
      ],
    },
    { id: "ex1", tipoId: "exposicao", agenda: [{ id: "ag3", cidade: "Montes Claros", uf: "MG", data: d("2026-11-20") }] },
    { id: "sem", tipoId: "oficina", agenda: [] },
  ];

  it("nível 1: uma tarefa por modelo, com prazo do projeto", () => {
    const out = gerarTarefas({ modelos: [modelo({ id: "n1", unidade: "PROJETO", prazoDias: 15 })], datas, acoes });
    expect(out).toHaveLength(1);
    expect(iso(out[0]!.prazo)).toBe("2026-03-16");
  });

  it("prazo pelo fim da realização (várias datas) e sem fim = um dia só", () => {
    const out = gerarTarefas({
      modelos: [modelo({ id: "pos", unidade: "ACAO", fase: "DEPOIS", prazoBase: "FIM_ACAO", prazoDias: 7 })],
      datas,
      acoes: [
        {
          id: "of",
          tipoId: "oficina",
          agenda: [
            { id: "a1", cidade: "Januária", uf: "MG", data: d("2026-11-09"), dataFim: d("2026-11-11") },
            { id: "a2", cidade: "Januária", uf: "MG", data: d("2026-11-20") },
          ],
        },
      ],
    });
    expect(out.map((t) => [t.agendaId, iso(t.prazo)])).toEqual([
      ["a1", "2026-11-18"],
      ["a2", "2026-11-27"],
    ]);
  });

  it("por ação: uma por realização; ação sem agenda fica sem prazo", () => {
    const out = gerarTarefas({ modelos: [modelo({ id: "mob", unidade: "ACAO", prazoDias: -7 })], datas, acoes });
    expect(out.map((t) => [t.acaoId, t.agendaId, iso(t.prazo)])).toEqual([
      ["of1", "ag1", "2026-10-12"],
      ["of1", "ag2", "2026-11-02"],
      ["ex1", "ag3", "2026-11-13"],
      ["sem", null, null],
    ]);
  });

  it("respeita o tipo de ação do modelo", () => {
    const out = gerarTarefas({
      modelos: [modelo({ id: "prof", unidade: "ACAO", tiposAcao: ["oficina"] })],
      datas,
      acoes,
    });
    expect(out.every((t) => t.acaoId !== "ex1")).toBe(true);
    expect(out).toHaveLength(3);
  });

  it("por cidade: junta as datas da cidade (sem acento/caixa): 1º início e último fim", () => {
    const out = gerarTarefas({
      modelos: [
        modelo({ id: "espaco", unidade: "CIDADE", area: "PRODUCAO", fase: "ANTES", prazoDias: -21 }),
        modelo({ id: "fecha", unidade: "CIDADE", area: "PRODUCAO", fase: "DEPOIS", prazoBase: "FIM_ACAO", prazoDias: 10 }),
      ],
      datas,
      acoes,
    });
    const jan = out.filter((t) => t.uf === "MG" && t.cidade?.startsWith("Janu"));
    expect(jan.map((t) => [t.modeloId, iso(t.prazo)])).toEqual([
      ["espaco", "2026-09-28"],
      ["fecha", "2026-11-19"],
    ]);
    expect(out.filter((t) => t.cidade === "Montes Claros")).toHaveLength(2);
  });

  it("execução online gera tarefa por ação, mas não por cidade", () => {
    const out = gerarTarefas({
      modelos: [
        modelo({ id: "pec", unidade: "ACAO", prazoDias: -10 }),
        modelo({ id: "espaco", unidade: "CIDADE", area: "PRODUCAO", prazoDias: -21 }),
      ],
      datas,
      acoes: [{ id: "on", tipoId: "palestra", agenda: [{ id: "g1", cidade: "", uf: "", data: d("2026-11-20"), online: true }] }],
    });
    expect(out.map((t) => [t.modeloId, t.agendaId, t.cidade, iso(t.prazo)])).toEqual([["pec", "g1", null, "2026-11-10"]]);
  });

  it("modelo inativo não gera tarefa", () => {
    expect(gerarTarefas({ modelos: [modelo({ id: "x", unidade: "PROJETO", ativo: false })], datas, acoes })).toEqual([]);
  });
});

describe("tarefasFaltantes", () => {
  it("rodar de novo não duplica (mesma chave)", () => {
    const geradas = gerarTarefas({
      modelos: [modelo({ id: "n1", unidade: "PROJETO" }), modelo({ id: "c", unidade: "CIDADE" })],
      datas,
      acoes: [{ id: "a", tipoId: "oficina", agenda: [{ id: "g", cidade: "São Francisco", uf: "MG", data: d("2026-11-01") }] }],
    });
    expect(tarefasFaltantes(geradas, geradas)).toEqual([]);
    const soProjeto = geradas.filter((t) => t.unidade === "PROJETO");
    expect(tarefasFaltantes(geradas, soProjeto).map((t) => t.modeloId)).toEqual(["c"]);
  });

  it("a chave de cidade ignora acento e caixa", () => {
    const k = (cidade: string, uf: string) =>
      chaveTarefa({ modeloId: "m", unidade: "CIDADE", acaoId: null, agendaId: null, cidade, uf });
    expect(k("São Francisco", "mg")).toBe(k("sao francisco ", "MG"));
  });
});
