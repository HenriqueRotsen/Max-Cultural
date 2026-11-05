"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { BarChart3, ChevronRight, Download, FileText, ListChecks, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  removerProdutoAction,
  salvarDadosProjetoAction,
  salvarProdutoAction,
  setPrestacaoEntregueAction,
} from "@/app/actions/prestacao";
import { EQUIPES } from "@/lib/prestacao/regras";
import { EQUIPE_LABEL, LEI_LABEL, LEIS, type PrestacaoProjetoDTO, type ProdutoDTO } from "@/lib/prestacao/types";
import { BarraEquipe } from "@/components/prestacao/progresso";
import { useConfirm } from "@/components/ui/confirm";

export type AbaPrestacao = "fichas" | "relatorios" | "produtos" | "dados";

function fmtDia(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function periodo(data: string, fim: string | null) {
  return fim && fim !== data ? `${fmtDia(data)} a ${fmtDia(fim)}` : fmtDia(data);
}

export function PrestacaoProjetoView({
  data,
  abaInicial,
  podeAcompanhamento,
}: {
  data: PrestacaoProjetoDTO;
  abaInicial: AbaPrestacao;
  podeAcompanhamento: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [aba, setAba] = useState<AbaPrestacao>(abaInicial);
  const p = data.projeto;

  function trocarAba(a: AbaPrestacao) {
    setAba(a);
    router.replace(`${pathname}?aba=${a}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/dashboard/prestacao" className="text-xs text-muted-foreground hover:text-brand-deep">
            ← Prestação de contas
          </Link>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">{p.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {[p.contextoNome, p.proponente, data.dados.identificacao, data.dados.lei ? LEI_LABEL[data.dados.lei] : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              href={`/projeto/${encodeURIComponent(p.id)}`}
              className="inline-flex items-center gap-1 font-medium text-teal-800 hover:underline"
            >
              <BarChart3 className="size-4" /> Indicadores do projeto
            </Link>
            {podeAcompanhamento ? (
              <Link
                href={`/dashboard/acompanhamento/${encodeURIComponent(p.id)}`}
                className="inline-flex items-center gap-1 font-medium text-teal-800 hover:underline"
              >
                <ListChecks className="size-4" /> Acompanhamento
              </Link>
            ) : null}
          </div>
        </div>
        <div className="text-right text-xs">
          {data.dados.entregueEm ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              Entregue em {fmtDia(data.dados.entregueEm)}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Em preparação</span>
          )}
        </div>
      </div>

      <ComoFunciona />

      <div className="grid gap-3 sm:grid-cols-3">
        {EQUIPES.map((e) => (
          <div key={e} className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
            <BarraEquipe equipe={e} pct={data.progresso[e].pct} />
            <p className="mt-1 text-xs text-muted-foreground">
              {data.execucoes.length
                ? `média das ${data.execucoes.length} fichas`
                : "nenhuma execução na agenda ainda"}
            </p>
          </div>
        ))}
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-white p-1 text-sm" aria-label="Seções">
        {(
          [
            ["fichas", `Fichas (${data.execucoes.length})`],
            ["relatorios", `Relatórios (${data.relatorios.length})`],
            ["produtos", `Produtos e metas (${data.produtos.length})`],
            ["dados", "Dados do projeto"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => trocarAba(id)}
            aria-current={aba === id ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium transition",
              aba === id ? "bg-brand-deep text-white" : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {aba === "fichas" ? <Fichas data={data} podeAcompanhamento={podeAcompanhamento} /> : null}
      {aba === "relatorios" ? <Relatorios data={data} /> : null}
      {aba === "produtos" ? <Produtos data={data} /> : null}
      {aba === "dados" ? <Dados data={data} /> : null}
    </div>
  );
}

function Fichas({ data, podeAcompanhamento }: { data: PrestacaoProjetoDTO; podeAcompanhamento: boolean }) {
  const produtoNome = new Map(data.produtos.map((p) => [p.id, p.nome]));
  const porAcao = new Map<string, typeof data.execucoes>();
  for (const e of data.execucoes) porAcao.set(e.acaoId, [...(porAcao.get(e.acaoId) ?? []), e]);

  if (!data.execucoes.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Nenhuma execução de ação na agenda. As fichas aparecem quando a gestão cadastra o período e o território de
        cada ação
        {podeAcompanhamento ? (
          <>
            {" "}
            na{" "}
            <Link
              href={`/dashboard/acompanhamento/${encodeURIComponent(data.projeto.id)}?aba=configuracao`}
              className="font-medium text-teal-800 underline"
            >
              Configuração do acompanhamento
            </Link>
          </>
        ) : null}
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {[...porAcao.values()].map((execs) => (
        <section key={execs[0]!.acaoId} className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-sm">
          <div className="flex items-baseline gap-2 border-b border-border/60 bg-muted/20 px-4 py-2.5">
            <h3 className="font-semibold text-brand-deep">{execs[0]!.acaoNome}</h3>
            <span className="rounded-full border border-brand/15 bg-brand-mist/60 px-2 py-0.5 text-[11px] font-medium text-brand-deep">
              {execs[0]!.tipoNome}
            </span>
          </div>
          <ul className="divide-y divide-border/50">
            {execs.map((e) => {
              const pendentes = EQUIPES.filter((q) => e.progresso[q].pct < 100);
              return (
                <li key={e.agendaId}>
                  <Link
                    href={`/dashboard/prestacao/${encodeURIComponent(data.projeto.id)}/ficha/${encodeURIComponent(e.agendaId)}`}
                    className="grid gap-3 px-4 py-3 transition hover:bg-muted/30 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-brand-deep">
                        {periodo(e.data, e.dataFim)}
                        {e.titulo ? <span className="font-normal text-muted-foreground"> · {e.titulo}</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.local}
                        {e.produtoId ? ` · ${produtoNome.get(e.produtoId) ?? ""}` : " · sem produto"}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {EQUIPES.map((q) => (
                        <BarraEquipe key={q} equipe={q} pct={e.progresso[q].pct} />
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {pendentes.length ? (
                        <span className="text-amber-800">Falta: {pendentes.map((q) => EQUIPE_LABEL[q]).join(", ")}</span>
                      ) : (
                        <span className="font-medium text-emerald-700">Completa</span>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {data.acoesSemAgenda.length ? (
        <p className="text-xs text-muted-foreground">
          Sem execução na agenda (ainda sem ficha): {data.acoesSemAgenda.map((a) => a.nome).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function Produtos({ data }: { data: PrestacaoProjetoDTO }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState<{ id?: string; nome: string; meta: string } | null>(null);
  const pode = data.pode.GESTAO;

  async function remover(p: ProdutoDTO) {
    const ok = await confirmar({
      title: `Remover o produto "${p.nome}"?`,
      description: p.fichas
        ? `${p.fichas} ficha(s) ligada(s) a ele ficarão sem produto. Os dados das fichas não são apagados.`
        : "Nenhuma ficha está ligada a ele.",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await removerProdutoAction(data.projeto.id, p.id);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Os produtos e metas prometidos no projeto (PRONAC, LEIC ou outra lei). Cada ficha é ligada a um produto, e o
          relatório sai por produto. Podem mudar ao longo do processo.
        </p>
        {pode ? (
          <Button size="sm" variant="outline" onClick={() => setEditando({ nome: "", meta: "" })}>
            <Plus className="size-4" /> Produto
          </Button>
        ) : null}
      </div>
      {data.produtos.length ? (
        <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-white shadow-sm">
          {data.produtos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-brand-deep">{p.nome}</div>
                <div className="whitespace-pre-wrap text-sm text-muted-foreground">{p.meta || "Sem meta informada."}</div>
                <div className="mt-1 text-xs text-muted-foreground">{p.fichas} ficha(s) ligada(s)</div>
              </div>
              {pode ? (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditando({ ...p })}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remover" disabled={pending} onClick={() => remover(p)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum produto cadastrado.
        </p>
      )}
      {editando ? (
        <ProdutoDialog projetoId={data.projeto.id} inicial={editando} onClose={() => setEditando(null)} />
      ) : null}
    </div>
  );
}

function ProdutoDialog({
  projetoId,
  inicial,
  onClose,
}: {
  projetoId: string;
  inicial: { id?: string; nome: string; meta: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(inicial.nome);
  const [meta, setMeta] = useState(inicial.meta);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>Como está no projeto aprovado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Produto</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Oficinas de formação" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Meta</Label>
            <Textarea rows={3} value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="Ex.: 20 oficinas, 400 participantes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={pending || !nome.trim()}
            onClick={() =>
              startTransition(async () => {
                const r = await salvarProdutoAction(projetoId, { id: inicial.id, nome, meta });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Produto salvo");
                router.refresh();
                onClose();
              })
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Dados({ data }: { data: PrestacaoProjetoDTO }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [pending, startTransition] = useTransition();
  const [lei, setLei] = useState(data.dados.lei ?? "");
  const [identificacao, setIdentificacao] = useState(data.dados.identificacao);
  const [patrocinador, setPatrocinador] = useState(data.dados.patrocinador);
  const [entrega, setEntrega] = useState("");
  const pode = data.pode.GESTAO;
  const p = data.projeto;

  function rodar(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível salvar.");
      toast.success(msg);
      setEntrega("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">Dados do projeto</h2>
          <p className="text-sm text-muted-foreground">
            Nome, proponente, ano e PRONAC vêm do cadastro do projeto ({p.nome} · {p.proponente || "sem proponente"} ·{" "}
            {p.ano || "sem ano"}).
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Lei de incentivo</Label>
            <SimpleSelect
              value={lei}
              onChange={setLei}
              disabled={!pode}
              className="h-9 w-full"
              aria-label="Lei de incentivo"
              options={[{ value: "", label: "Não informada" }, ...LEIS.map((l) => ({ value: l.value, label: l.label }))]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Identificação na lei</Label>
            <Input
              value={identificacao}
              onChange={(e) => setIdentificacao(e.target.value)}
              disabled={!pode}
              placeholder="Ex.: PRONAC 240001, LEIC CA 1234"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Patrocinador</Label>
            <Input value={patrocinador} onChange={(e) => setPatrocinador(e.target.value)} disabled={!pode} />
          </div>
        </div>
        {pode ? (
          <Button
            disabled={pending}
            onClick={() =>
              rodar(
                () => salvarDadosProjetoAction(p.id, { lei: lei || null, identificacao, patrocinador }),
                "Dados do projeto salvos",
              )
            }
          >
            Salvar dados
          </Button>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">Entrega da prestação de contas</h2>
          <p className="text-sm text-muted-foreground">
            Quando a prestação de contas for enviada ao SALIC ou à outra plataforma. A partir dessa data contam os 12
            meses em que os arquivos ficam também no sistema, antes de ficarem só no drive.
          </p>
        </div>
        {data.dados.entregueEm ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              Entregue em {fmtDia(data.dados.entregueEm)}
            </span>
            {pode ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirmar({
                    title: "Desfazer a entrega?",
                    description: "O projeto volta para \"em preparação\" e o prazo de arquivamento dos arquivos deixa de contar.",
                    confirmLabel: "Desfazer entrega",
                    destructive: true,
                  });
                  if (ok) rodar(() => setPrestacaoEntregueAction(p.id, null), "Entrega desfeita");
                }}
              >
                Desfazer
              </Button>
            ) : null}
          </div>
        ) : pode ? (
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker value={entrega} onChange={setEntrega} className="w-52" aria-label="Data da entrega" />
            <Button
              variant="outline"
              className="h-9"
              disabled={pending || !entrega}
              onClick={() => rodar(() => setPrestacaoEntregueAction(p.id, entrega), "Entrega registrada")}
            >
              Marcar como entregue
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não entregue.</p>
        )}
      </section>
    </div>
  );
}

function Relatorios({ data }: { data: PrestacaoProjetoDTO }) {
  const router = useRouter();
  const [produtoId, setProdutoId] = useState("");
  const [listaNominal, setListaNominal] = useState(false);
  const [gerando, setGerando] = useState(false);
  const pode = data.pode.GESTAO;
  const fichasComFoto = data.execucoes.length;

  async function gerar() {
    setGerando(true);
    try {
      const r = await fetch(`/api/prestacao/projetos/${encodeURIComponent(data.projeto.id)}/relatorios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: produtoId || null, listaNominal }),
      });
      const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !j.id) throw new Error(j.error || `Falha (${r.status}).`);
      toast.success("Relatório gerado");
      window.open(`/api/prestacao/relatorios/${j.id}`, "_blank", "noopener");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">Gerar relatório em PDF</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Junta os dados do projeto e das inscrições, o perfil do público, os formulários e avaliações, o que as
            equipes preencheram nas fichas e as fotos marcadas para o relatório, agrupadas por categoria e com a
            descrição como legenda.
          </p>
        </div>
        {pode ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm space-y-1.5">
              <Label>Produto</Label>
              <SimpleSelect
                value={produtoId}
                onChange={setProdutoId}
                className="h-9 w-full"
                aria-label="Produto do relatório"
                options={[
                  { value: "", label: "Todos os produtos (relatório completo)" },
                  ...data.produtos.map((p) => ({ value: p.id, label: p.nome })),
                ]}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" className="size-4" checked={listaNominal} onChange={(e) => setListaNominal(e.target.checked)} />
              Incluir lista de participantes (só nomes)
            </label>
            <Button disabled={gerando || !fichasComFoto} onClick={() => void gerar()}>
              {gerando ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {gerando ? "Gerando…" : "Gerar relatório"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Só a gestão da prestação de contas gera relatórios.</p>
        )}
        {!fichasComFoto ? <p className="text-xs text-amber-800">O projeto ainda não tem execuções na agenda.</p> : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-white shadow-sm">
        <h2 className="border-b border-border/60 px-4 py-3 font-heading text-base font-semibold text-brand-deep">
          Relatórios gerados
        </h2>
        {data.relatorios.length ? (
          <ul className="divide-y divide-border/60">
            {data.relatorios.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-brand-deep hover:underline">
                    {r.produtoNome ?? "Relatório completo"}
                  </a>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {r.geradoPorNome} ·{" "}
                    {(r.tamanho / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
                <a
                  href={`${r.url}?baixar=1`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-brand-deep hover:bg-muted/40"
                >
                  <Download className="size-3.5" /> Baixar
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
        )}
      </section>
    </div>
  );
}

const PASSOS = [
  {
    quem: "Gestão",
    titulo: "Dados e produtos",
    texto: "Uma vez por projeto: lei, identificação e patrocinador em Dados do projeto; os produtos e metas prometidos em Produtos e metas.",
  },
  {
    quem: "Produção, Comunicação e Gestão",
    titulo: "Fichas das execuções",
    texto: "Em Fichas, abra cada execução da ação: cada equipe preenche a sua parte e envia as fotos (com categoria e descrição) e os documentos em PDF.",
  },
  {
    quem: "Gestão",
    titulo: "Relatório em PDF",
    texto: "Em Relatórios, gere o PDF: o sistema junta as fichas e as fotos com as inscrições, o perfil do público, os formulários e as avaliações.",
  },
];

const CHAVE_COMO_FUNCIONA = "prestacao:como-funciona:escondido";
const EVENTO_COMO_FUNCIONA = "prestacao:como-funciona";

function lerEscondido(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_COMO_FUNCIONA) === "1";
  } catch {
    return false;
  }
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO_COMO_FUNCIONA, aviso);
  return () => window.removeEventListener(EVENTO_COMO_FUNCIONA, aviso);
}

/** Os 3 passos da prestação de contas, para quem chega pela primeira vez (dá para esconder). */
function ComoFunciona() {
  // No servidor começa recolhido; no navegador vale o que a pessoa escolheu.
  const escondido = useSyncExternalStore(assinar, lerEscondido, () => true);
  function alternar(v: boolean) {
    try {
      window.localStorage.setItem(CHAVE_COMO_FUNCIONA, v ? "1" : "0");
    } catch {
      /* sem armazenamento local */
    }
    window.dispatchEvent(new Event(EVENTO_COMO_FUNCIONA));
  }
  if (escondido) {
    return (
      <button type="button" onClick={() => alternar(false)} className="text-sm font-medium text-teal-800 hover:underline">
        Como funciona a prestação de contas?
      </button>
    );
  }
  return (
    <section className="relative rounded-2xl border border-brand/15 bg-brand-mist/50 p-4">
      <button
        type="button"
        onClick={() => alternar(true)}
        aria-label="Esconder"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-white hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <h2 className="font-heading text-base font-semibold text-brand-deep">Como funciona</h2>
      <ol className="mt-3 grid gap-3 md:grid-cols-3">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-deep text-sm font-semibold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{p.quem}</div>
              <div className="font-semibold text-brand-deep">{p.titulo}</div>
              <p className="mt-0.5 text-sm text-muted-foreground">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
