import { prisma } from "@/lib/prisma";
import { aggregateSocio } from "@/lib/socio";
import type { SocioBreakdown } from "@/lib/socio-cohort";
import { lerArquivoPrivado } from "@/lib/storage/privado";
import { territorioLabel } from "@/lib/acompanhamento/types";
import { enderecoLabel, formatarNumero, mesesDoPeriodo, minutosEmHoras, type ValoresFicha } from "@/lib/prestacao/regras";
import { CATEGORIA_LABEL, CATEGORIAS_FOTO, LEI_LABEL } from "@/lib/prestacao/types";

/** Tudo o que o relatório em PDF precisa, já resolvido (sem acesso ao banco no desenho). */
export type DadosRelatorio = {
  titulo: string;
  geradoEm: Date;
  projeto: {
    nome: string;
    proponente: string;
    ano: string;
    contexto: string;
    identificacao: string;
    lei: string;
    patrocinador: string;
    periodo: string;
  };
  totais: { execucoes: number; acoes: number; inscritos: number; participantes: number; pcds: number; certificados: number };
  perfil: SocioBreakdown | null;
  produtos: ProdutoRelatorio[];
  anexos: Array<{ execucao: string; categoria: string; nome: string }>;
  listaNominal: Array<{ acao: string; nomes: string[] }> | null;
};

export type ProdutoRelatorio = { nome: string; meta: string; execucoes: ExecucaoRelatorio[] };

export type FotoRelatorio = { dados: Buffer; descricao: string; largura: number | null; altura: number | null };

export type ExecucaoRelatorio = {
  acao: string;
  tipo: string;
  local: string;
  periodo: string;
  meses: string;
  numeros: Array<{ rotulo: string; valor: number }>;
  numerosDaAcaoToda: boolean;
  informacoes: Array<{ rotulo: string; valor: string }>;
  formularios: Array<{ titulo: string; tipo: string; respostas: number; periodo: string }>;
  avaliacao: Array<{ pergunta: string; opcoes: Array<{ opcao: string; total: number }> }>;
  fotos: Array<{ categoria: string; itens: FotoRelatorio[] }>;
};

const dia = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
const periodo = (a: Date, b: Date | null) => (b && b > a ? `${dia(a)} a ${dia(b)}` : dia(a));

function pcd(s: string) {
  const t = s.trim().toLowerCase();
  return Boolean(t) && !t.startsWith("n");
}

/** Respostas de múltipla escolha somadas, por pergunta, dos formulários de avaliação. */
function somarAvaliacao(
  campos: Array<{ id: string; rotulo: string; tipo: string; opcoes: unknown }>,
  respostas: Array<{ payload: unknown }>,
) {
  const escolha = campos.filter((c) => ["MULTIPLE_CHOICE", "DROPDOWN", "CHECKBOXES"].includes(c.tipo));
  return escolha
    .map((c) => {
      const opcoes = Array.isArray(c.opcoes) ? c.opcoes.map(String) : [];
      const contagem = new Map(opcoes.map((o) => [o, 0]));
      for (const r of respostas) {
        const v = (r.payload as { answers?: Record<string, unknown> })?.answers?.[c.id];
        for (const x of Array.isArray(v) ? v : [v]) {
          if (typeof x === "string" && x) contagem.set(x, (contagem.get(x) ?? 0) + 1);
        }
      }
      return { pergunta: c.rotulo, opcoes: [...contagem].map(([opcao, total]) => ({ opcao, total })) };
    })
    .filter((p) => p.opcoes.some((o) => o.total > 0));
}

export async function montarDadosRelatorio(
  projetoId: string,
  opts: { produtoId: string | null; listaNominal: boolean },
): Promise<DadosRelatorio> {
  const projeto = await prisma.projeto.findUniqueOrThrow({
    where: { id: projetoId },
    select: {
      nome: true,
      pronac: true,
      proponente: true,
      ano: true,
      contexto: { select: { nome: true } },
      prestacao: true,
      acompanhamento: { select: { inicioExecucao: true, fimExecucao: true } },
      produtos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] },
    },
  });
  const campos = await prisma.prestacaoCampo.findMany({ where: { ativo: true }, orderBy: [{ equipe: "asc" }, { ordem: "asc" }] });
  const fichas = await prisma.prestacaoFicha.findMany({
    where: { projetoId, ...(opts.produtoId ? { produtoId: opts.produtoId } : {}) },
    include: {
      arquivos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] },
      agenda: {
        select: {
          data: true,
          dataFim: true,
          online: true,
          cidade: true,
          uf: true,
          titulo: true,
          territorio: { select: { nome: true, cidade: true, estado: true } },
          acao: {
            select: {
              id: true,
              nome: true,
              tipo: { select: { nome: true } },
              _count: { select: { agenda: true } },
            },
          },
        },
      },
    },
    orderBy: { agenda: { data: "asc" } },
  });

  const acaoIds = [...new Set(fichas.map((f) => f.agenda.acao.id))];
  // Formulários da ação (inscrição e avaliação), com as respostas não rejeitadas.
  const formularios = await prisma.formulario.findMany({
    where: { acaoId: { in: acaoIds } },
    select: {
      acaoId: true,
      titulo: true,
      tipo: true,
      abreEm: true,
      encerraEm: true,
      campos: { select: { id: true, rotulo: true, tipo: true, opcoes: true } },
      respostas: { where: { status: { not: "REJECTED" } }, select: { payload: true } },
    },
  });
  const formulariosDa = (id: string) => formularios.filter((fm) => fm.acaoId === id);
  const inscricoes = await prisma.inscricao.findMany({
    where: { idAcao: { in: acaoIds } },
    select: { idAcao: true, nome: true, selecionados: true, participantes: true, certificado: true, possuiDeficiencia: true },
    orderBy: { nome: "asc" },
  });
  const porAcao = new Map<string, typeof inscricoes>();
  for (const i of inscricoes) porAcao.set(i.idAcao, [...(porAcao.get(i.idAcao) ?? []), i]);
  const numerosAcao = (id: string) => {
    const rows = porAcao.get(id) ?? [];
    return {
      inscritos: rows.length,
      selecionados: rows.filter((r) => r.selecionados === 1).length,
      participantes: rows.filter((r) => r.participantes === 1).length,
      pcds: rows.filter((r) => r.participantes === 1 && pcd(r.possuiDeficiencia)).length,
      certificados: rows.filter((r) => r.certificado === 1).length,
    };
  };

  const anexos: DadosRelatorio["anexos"] = [];
  const execucoes = await Promise.all(
    fichas.map(async (f) => {
      const g = f.agenda;
      const local = g.online ? "Online" : g.territorio ? territorioLabel(g.territorio) : [g.cidade, g.uf].filter(Boolean).join(", ");
      const auto = numerosAcao(g.acao.id);
      const ajustes = (f.ajustes ?? {}) as Record<string, number>;
      const num = (k: keyof typeof auto) => (typeof ajustes[k] === "number" ? ajustes[k]! : auto[k]);
      const valores = (f.valores ?? {}) as ValoresFicha;
      const informacoes = campos
        .filter((c) => c.tipo !== "LINK")
        .map((c) => {
          const v = valores[c.chave];
          if (!v || v.na || v.v == null || String(v.v).trim() === "") return null;
          const texto = Array.isArray(v.v)
            ? v.v.join(", ")
            : typeof v.v === "object"
              ? enderecoLabel(v.v)
              : c.tipo === "NUMERO" && c.chave !== "carga_horaria_min"
                ? formatarNumero(Number(v.v))
                : c.tipo === "HORARIO"
              ? String(v.v).replace("-", " às ")
              : c.chave === "carga_horaria_min"
                ? `${minutosEmHoras(Number(v.v))} (${v.v} min)`
                : String(v.v);
          return { rotulo: c.rotulo, valor: texto };
        })
        .filter((x): x is { rotulo: string; valor: string } => x !== null);
      const titulo = `${g.acao.nome} · ${periodo(g.data, g.dataFim)} · ${local}`;
      for (const a of f.arquivos.filter((a) => a.tipo === "DOCUMENTO" && a.noRelatorio)) {
        anexos.push({ execucao: titulo, categoria: CATEGORIA_LABEL[a.categoria] ?? a.categoria, nome: a.nomeOriginal });
      }
      const fotosNoRelatorio = f.arquivos.filter((a) => a.tipo === "FOTO" && a.noRelatorio);
      const fotos = await Promise.all(
        CATEGORIAS_FOTO.map(async (c) => ({
          categoria: c.label,
          itens: await Promise.all(
            fotosNoRelatorio
              .filter((a) => a.categoria === c.value)
              .map(async (a) => ({
                dados: await lerArquivoPrivado(a.storagePath),
                descricao: a.descricao,
                largura: a.largura,
                altura: a.altura,
              })),
          ),
        })),
      );
      return {
        produtoId: f.produtoId,
        acaoId: g.acao.id,
        exec: {
          acao: g.acao.nome,
          tipo: g.acao.tipo.nome,
          local,
          periodo: periodo(g.data, g.dataFim),
          meses: mesesDoPeriodo(g.data, g.dataFim).rotulo,
          numeros: [
            { rotulo: "Inscritos", valor: num("inscritos") },
            { rotulo: "Selecionados", valor: num("selecionados") },
            { rotulo: "Participantes", valor: num("participantes") },
            { rotulo: "PCDs participantes", valor: num("pcds") },
            { rotulo: "Certificados", valor: num("certificados") },
          ],
          numerosDaAcaoToda: g.acao._count.agenda > 1,
          informacoes,
          formularios: formulariosDa(g.acao.id).map((fm) => ({
            titulo: fm.titulo,
            tipo: fm.tipo === "AVALIACAO" ? "Avaliação" : "Inscrição",
            respostas: fm.respostas.length,
            periodo: fm.abreEm ? periodo(fm.abreEm, fm.encerraEm) : "",
          })),
          avaliacao: formulariosDa(g.acao.id)
            .filter((fm) => fm.tipo === "AVALIACAO")
            .flatMap((fm) => somarAvaliacao(fm.campos, fm.respostas)),
          fotos: fotos.filter((c) => c.itens.length),
        } satisfies ExecucaoRelatorio,
      };
    }),
  );

  // Produtos na ordem do projeto; execuções sem produto no fim (só no relatório geral).
  const produtosAlvo = opts.produtoId ? projeto.produtos.filter((p) => p.id === opts.produtoId) : projeto.produtos;
  const produtos: ProdutoRelatorio[] = produtosAlvo.map((p) => ({
    nome: p.nome,
    meta: p.meta,
    execucoes: execucoes.filter((e) => e.produtoId === p.id).map((e) => e.exec),
  }));
  const semProduto = execucoes.filter((e) => !e.produtoId || !projeto.produtos.some((p) => p.id === e.produtoId));
  if (!opts.produtoId && semProduto.length) {
    produtos.push({ nome: "Ações sem produto definido", meta: "", execucoes: semProduto.map((e) => e.exec) });
  }

  // Totais por ação (os números das inscrições são da ação, não somar duas vezes).
  const acoesUnicas = [...new Set(execucoes.map((e) => e.acaoId))];
  const somar = (k: "inscritos" | "participantes" | "pcds" | "certificados") =>
    acoesUnicas.reduce((acc, id) => acc + numerosAcao(id)[k], 0);
  const p = projeto.prestacao;
  const a = projeto.acompanhamento;
  const produtoTitulo = opts.produtoId ? produtosAlvo[0]?.nome : null;

  return {
    titulo: produtoTitulo ? `Prestação de contas · ${produtoTitulo}` : "Prestação de contas",
    geradoEm: new Date(),
    projeto: {
      nome: projeto.nome,
      proponente: projeto.proponente,
      ano: projeto.ano,
      contexto: projeto.contexto.nome,
      identificacao: p?.identificacao || (projeto.pronac ? `PRONAC ${projeto.pronac}` : ""),
      lei: p?.lei ? (LEI_LABEL[p.lei] ?? p.lei) : "",
      patrocinador: p?.patrocinador ?? "",
      periodo: a?.inicioExecucao ? periodo(a.inicioExecucao, a.fimExecucao) : "",
    },
    totais: {
      execucoes: execucoes.length,
      acoes: acoesUnicas.length,
      inscritos: somar("inscritos"),
      participantes: somar("participantes"),
      pcds: somar("pcds"),
      certificados: somar("certificados"),
    },
    perfil: acoesUnicas.length ? await aggregateSocio({ idAcao: { in: acoesUnicas } }) : null,
    produtos: produtos.filter((x) => x.execucoes.length || opts.produtoId),
    anexos,
    listaNominal: opts.listaNominal
      ? acoesUnicas.map((id) => ({
          acao: execucoes.find((e) => e.acaoId === id)!.exec.acao,
          nomes: (porAcao.get(id) ?? [])
            .filter((r) => r.participantes === 1)
            .map((r) => r.nome)
            .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
        }))
      : null,
  };
}
