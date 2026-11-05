import { describe, expect, it } from "vitest";
import {
  calcularPrazo,
  chaveTarefa,
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
    prazoBase: p.unidade === "PROJETO" ? "INICIO_EXECUCAO" : "DATA_ACAO",
    prazoDias: 0,
    tiposAcao: [],
    ordem: 0,
    ativo: true,
    ...p,
  };
}

const datas = { inicioExecucao: d("2026-03-01"), fimExecucao: d("2026-12-31") };

describe("calcularPrazo", () => {
  it("soma dias ao início, ao fim ou à data da ação", () => {
    expect(iso(calcularPrazo({ prazoBase: "INICIO_EXECUCAO", prazoDias: 15 }, datas))).toBe("2026-03-16");
    expect(iso(calcularPrazo({ prazoBase: "FIM_EXECUCAO", prazoDias: 30 }, datas))).toBe("2027-01-30");
    expect(iso(calcularPrazo({ prazoBase: "DATA_ACAO", prazoDias: -7 }, datas, d("2026-11-09")))).toBe("2026-11-02");
  });

  it("sem base ou sem dias não há prazo", () => {
    expect(calcularPrazo({ prazoBase: null, prazoDias: 3 }, datas)).toBeNull();
    expect(calcularPrazo({ prazoBase: "INICIO_EXECUCAO", prazoDias: null }, datas)).toBeNull();
    expect(calcularPrazo({ prazoBase: "INICIO_EXECUCAO", prazoDias: 5 }, { inicioExecucao: null, fimExecucao: null })).toBeNull();
    expect(calcularPrazo({ prazoBase: "DATA_ACAO", prazoDias: 5 }, datas, null)).toBeNull();
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

  it("por cidade: junta as datas da cidade (sem acento/caixa) e usa a 1ª ou a última", () => {
    const out = gerarTarefas({
      modelos: [
        modelo({ id: "espaco", unidade: "CIDADE", area: "PRODUCAO", fase: "ANTES", prazoDias: -21 }),
        modelo({ id: "fecha", unidade: "CIDADE", area: "PRODUCAO", fase: "DEPOIS", prazoDias: 10 }),
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
