import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DadosRelatorio, ExecucaoRelatorio, FotoRelatorio } from "@/lib/prestacao/relatorio/dados";
import type { SocioBucket } from "@/lib/socio-cohort";

/** Cores da marca MAX Indicadores. */
const C = {
  deep: "#0d5c63",
  brand: "#00a8a8",
  soft: "#e7f5f5",
  mist: "#f3fafa",
  texto: "#1f2a30",
  suave: "#5f6b73",
  linha: "#dfe5e8",
  laranja: "#f08a24",
};

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 10, color: C.texto, lineHeight: 1.35 },
  rodape: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: C.suave, borderTopWidth: 0.5, borderTopColor: C.linha, paddingTop: 6 },
  capa: { padding: 0, fontFamily: "Helvetica", color: C.texto },
  capaFaixa: { backgroundColor: C.deep, paddingHorizontal: 48, paddingTop: 56, paddingBottom: 40 },
  capaTipo: { fontSize: 11, color: C.soft, letterSpacing: 2, textTransform: "uppercase" },
  capaTitulo: { fontSize: 30, fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: 8, lineHeight: 1.15 },
  capaSub: { fontSize: 13, color: C.soft, marginTop: 10 },
  capaCorpo: { paddingHorizontal: 48, paddingTop: 36 },
  capaGrade: { flexDirection: "row", flexWrap: "wrap" },
  capaItem: { width: "50%", marginBottom: 16, paddingRight: 12 },
  rot: { fontSize: 8, color: C.suave, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  val: { fontSize: 11 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.deep, marginBottom: 4 },
  h2: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.deep, marginBottom: 6 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.deep, marginTop: 10, marginBottom: 6 },
  suave: { color: C.suave },
  kpis: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginTop: 8, marginBottom: 6 },
  kpi: { width: "25%", paddingHorizontal: 4, marginBottom: 8 },
  kpiCaixa: { backgroundColor: C.mist, borderRadius: 6, padding: 10, borderLeftWidth: 3, borderLeftColor: C.brand },
  kpiNum: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.deep, lineHeight: 1.1, marginBottom: 3 },
  kpiRot: { fontSize: 8.5, color: C.suave },
  kpiUnicos: { fontSize: 7.5, color: C.suave, marginTop: 2 },
  barraLinha: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  barraRot: { width: "38%", fontSize: 8.5, paddingRight: 6 },
  barraFundo: { flexGrow: 1, height: 7, backgroundColor: C.soft, borderRadius: 3 },
  barra: { height: 7, backgroundColor: C.brand, borderRadius: 3 },
  barraNum: { width: 46, textAlign: "right", fontSize: 8.5, color: C.suave },
  produto: { backgroundColor: C.deep, borderRadius: 8, padding: 14, marginBottom: 14 },
  produtoRot: { fontSize: 8, color: C.soft, letterSpacing: 1.5, textTransform: "uppercase" },
  produtoNome: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: 3 },
  produtoMeta: { fontSize: 10, color: C.soft, marginTop: 6 },
  exec: { marginBottom: 18 },
  execTopo: { borderLeftWidth: 4, borderLeftColor: C.laranja, paddingLeft: 10, marginBottom: 8 },
  execNome: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.deep },
  execSub: { fontSize: 9.5, color: C.suave, marginTop: 2 },
  nums: { flexDirection: "row", marginHorizontal: -3, marginBottom: 6 },
  num: { flex: 1, marginHorizontal: 3, backgroundColor: C.mist, borderRadius: 5, paddingVertical: 6, alignItems: "center" },
  numVal: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.deep, lineHeight: 1.1, marginBottom: 2 },
  numRot: { fontSize: 7.5, color: C.suave, textAlign: "center" },
  numUnicos: { fontSize: 6.5, color: C.suave, textAlign: "center", marginTop: 1 },
  info: { flexDirection: "row", flexWrap: "wrap" },
  infoItem: { width: "50%", paddingRight: 10, marginBottom: 6 },
  fotos: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  foto: { width: "50%", paddingHorizontal: 5, marginBottom: 10 },
  fotoImg: { width: "100%", height: 170, objectFit: "cover", borderRadius: 4 },
  legenda: { fontSize: 8.5, color: C.suave, marginTop: 4 },
  tabela: { borderTopWidth: 0.5, borderTopColor: C.linha },
  tabLinha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.linha, paddingVertical: 5 },
  aviso: { fontSize: 8.5, color: C.suave, fontFamily: "Helvetica-Oblique", marginBottom: 4 },
});

function Rodape({ projeto }: { projeto: string }) {
  return (
    <View style={s.rodape} fixed>
      <Text>MAX Indicadores · {projeto}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Barras({ titulo, itens }: { titulo: string; itens: SocioBucket[] }) {
  const lista = itens.filter((i) => i.count > 0).sort((a, b) => b.count - a.count).slice(0, 7);
  if (!lista.length) return null;
  const max = Math.max(...lista.map((i) => i.count));
  return (
    <View style={{ width: "50%", paddingRight: 14, marginBottom: 12 }} wrap={false}>
      <Text style={s.h3}>{titulo}</Text>
      {lista.map((i) => (
        <View key={i.label} style={s.barraLinha}>
          <Text style={s.barraRot}>{i.label}</Text>
          <View style={s.barraFundo}>
            <View style={[s.barra, { width: `${Math.max(3, (i.count / max) * 100)}%` }]} />
          </View>
          <Text style={s.barraNum}>
            {i.count} · {Math.round(i.pct)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

function Foto({ f }: { f: FotoRelatorio }) {
  return (
    <View style={s.foto} wrap={false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
      <Image src={f.dados} style={s.fotoImg} />
      {f.descricao ? <Text style={s.legenda}>{f.descricao}</Text> : null}
    </View>
  );
}

function Execucao({ e }: { e: ExecucaoRelatorio }) {
  return (
    <View style={s.exec}>
      <View style={s.execTopo} wrap={false}>
        <Text style={s.execNome}>{e.acao}</Text>
        <Text style={s.execSub}>
          {e.tipo} · {e.periodo} · {e.local}
        </Text>
      </View>

      <View style={s.nums} wrap={false}>
        {e.numeros.map((n) => (
          <View key={n.rotulo} style={s.num}>
            <Text style={s.numVal}>{n.valor}</Text>
            <Text style={s.numRot}>{n.rotulo}</Text>
            {n.unicos != null ? <Text style={s.numUnicos}>{n.unicos} CPFs únicos</Text> : null}
          </View>
        ))}
      </View>
      {e.numerosDaAcaoToda ? <Text style={s.aviso}>Números das inscrições da ação (todas as execuções).</Text> : null}

      {e.informacoes.length ? (
        <View style={s.info}>
          {e.informacoes.map((i) => (
            <View key={i.rotulo} style={s.infoItem} wrap={false}>
              <Text style={s.rot}>{i.rotulo}</Text>
              <Text>{i.valor}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {e.formularios.length ? (
        <View wrap={false}>
          <Text style={s.h3}>Formulários</Text>
          {e.formularios.map((f) => (
            <Text key={f.titulo}>
              {f.tipo}: {f.titulo} · {f.respostas} resposta(s){f.periodo ? ` · ${f.periodo}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {e.avaliacao.length ? (
        <View>
          <Text style={s.h3}>Avaliação dos participantes</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {e.avaliacao.map((a) => {
              const total = a.opcoes.reduce((acc, o) => acc + o.total, 0) || 1;
              return (
                <Barras
                  key={a.pergunta}
                  titulo={a.pergunta}
                  itens={a.opcoes.map((o) => ({ label: o.opcao, count: o.total, pct: (o.total / total) * 100 }))}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {e.fotos.map((g) => (
        // Até 4 fotos (2 linhas) a categoria fica inteira na mesma página; o título nunca fica sozinho.
        <View key={g.categoria} wrap={g.itens.length > 4}>
          <Text style={s.h3} minPresenceAhead={200}>
            {g.categoria}
          </Text>
          <View style={s.fotos}>
            {g.itens.map((f, i) => (
              <Foto key={i} f={f} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function DocumentoPrestacao({ d, logo }: { d: DadosRelatorio; logo: Buffer | null }) {
  const p = d.projeto;
  const geradoEm = d.geradoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const itensCapa = [
    ["Proponente", p.proponente],
    ["Identificação", p.identificacao],
    ["Lei de incentivo", p.lei],
    ["Patrocinador", p.patrocinador],
    ["Período de execução", p.periodo],
    ["Contexto", p.contexto],
  ].filter(([, v]) => v);

  return (
    <Document title={`${d.titulo} · ${p.nome}`} author="MAX Indicadores" creator="MAX Indicadores">
      <Page size="A4" style={s.capa}>
        <View style={s.capaFaixa}>
          {logo ? (
            <View style={{ alignSelf: "flex-start", backgroundColor: "#ffffff", borderRadius: 8, padding: 10, marginBottom: 48 }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
              <Image src={logo} style={{ width: 140 }} />
            </View>
          ) : null}
          <Text style={s.capaTipo}>{d.titulo}</Text>
          <Text style={s.capaTitulo}>{p.nome}</Text>
          {p.ano ? <Text style={s.capaSub}>{p.ano}</Text> : null}
        </View>
        <View style={s.capaCorpo}>
          <View style={s.capaGrade}>
            {itensCapa.map(([r, v]) => (
              <View key={r} style={s.capaItem}>
                <Text style={s.rot}>{r}</Text>
                <Text style={s.val}>{v}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.suave, { marginTop: 24, fontSize: 9 }]}>Relatório gerado pelo MAX Indicadores em {geradoEm}.</Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Resumo</Text>
        <View style={s.kpis}>
          {(
            [
              ["Execuções de ações", d.totais.execucoes],
              ["Ações", d.totais.acoes],
              ["Inscritos", d.totais.inscritos, d.totais.cpfsUnicos.inscritos],
              ["Participantes", d.totais.participantes, d.totais.cpfsUnicos.participantes],
              ["PCDs participantes", d.totais.pcds],
              ["Certificados", d.totais.certificados, d.totais.cpfsUnicos.certificados],
            ] as const
          ).map(([r, v, u]) => (
            <View key={r} style={s.kpi}>
              <View style={s.kpiCaixa}>
                <Text style={s.kpiNum}>{v}</Text>
                <Text style={s.kpiRot}>{r}</Text>
                {u != null ? <Text style={s.kpiUnicos}>{u} CPFs únicos</Text> : null}
              </View>
            </View>
          ))}
        </View>
        {d.perfil && d.perfil.total ? (
          <View>
            <Text style={s.h2}>Perfil do público inscrito</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <Barras titulo="Gênero" itens={d.perfil.genero} />
              <Barras titulo="Raça/cor" itens={d.perfil.etnia} />
              <Barras titulo="Faixa etária" itens={d.perfil.idade} />
              <Barras titulo="Pessoa com deficiência" itens={d.perfil.deficienca} />
              <Barras titulo="Escolaridade" itens={d.perfil.escolaridade} />
            </View>
          </View>
        ) : null}
        <Rodape projeto={p.nome} />
      </Page>

      {d.produtos.map((prod) => (
        <Page key={prod.nome} size="A4" style={s.page}>
          <View style={s.produto} wrap={false}>
            <Text style={s.produtoRot}>Produto</Text>
            <Text style={s.produtoNome}>{prod.nome}</Text>
            {prod.meta ? <Text style={s.produtoMeta}>Meta: {prod.meta}</Text> : null}
          </View>
          {prod.execucoes.length ? (
            prod.execucoes.map((e, i) => <Execucao key={i} e={e} />)
          ) : (
            <Text style={s.suave}>Nenhuma execução ligada a este produto ainda.</Text>
          )}
          <Rodape projeto={p.nome} />
        </Page>
      ))}

      {d.anexos.length ? (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>Anexos</Text>
          <Text style={[s.suave, { marginBottom: 10 }]}>Documentos enviados nas fichas, guardados no MAX Indicadores.</Text>
          <View style={s.tabela}>
            {d.anexos.map((a, i) => (
              <View key={i} style={s.tabLinha} wrap={false}>
                <Text style={{ width: "30%", paddingRight: 6 }}>{a.categoria}</Text>
                <Text style={{ width: "35%", paddingRight: 6 }}>{a.nome}</Text>
                <Text style={{ width: "35%", color: C.suave }}>{a.execucao}</Text>
              </View>
            ))}
          </View>
          <Rodape projeto={p.nome} />
        </Page>
      ) : null}

      {d.listaNominal?.filter((l) => l.nomes.length).map((l) => (
        <Page key={l.acao} size="A4" style={s.page}>
          <Text style={s.h1}>Participantes · {l.acao}</Text>
          <Text style={[s.suave, { marginBottom: 10 }]}>{l.nomes.length} participante(s). Só nomes (sem dados pessoais).</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {l.nomes.map((n, i) => (
              <Text key={i} style={{ width: "50%", paddingVertical: 2 }}>
                {i + 1}. {n}
              </Text>
            ))}
          </View>
          <Rodape projeto={p.nome} />
        </Page>
      ))}
    </Document>
  );
}
