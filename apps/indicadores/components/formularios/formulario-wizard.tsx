"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createAcaoAction,
  listContextosSelectAction,
  listAcoesSelectAction,
  listProjetosSelectAction,
} from "@/app/actions/contextos";
import {
  createFormularioAction,
  getFormularioModeloByTipoAction,
  setAcaoResponsavelesAction,
} from "@/app/actions/formularios";
import {
  NovoContextoButton,
  NovoProjetoButton,
  acaoDtoToOption,
  acaoOndeLabel,
  acaoSemTerritorio,
} from "@/components/admin/hierarchy-quick-create";
import {
  AcaoModalidadeFields,
  emptyAcaoModalidade,
  territoriosPayload,
} from "@/components/admin/acao-modalidade-fields";
import { SearchSelect } from "@/components/ui/search-select";
import { CampoEditor } from "@/components/formularios/campo-editor";
import { CapaField } from "@/components/formularios/capa-field";
import {
  ProfessorPicker,
  type ProfessorUserOpt,
} from "@/components/formularios/professor-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FormularioCampoDraft } from "@/lib/formularios/types";
import type {
  ContextoSelectOption,
  AcaoSelectOption,
  ProjetoSelectOption,
} from "@/lib/hierarchy-list";

type Step = "contexto" | "campos" | "config";
type TipoForm = "INSCRICAO" | "AVALIACAO";

type UserOpt = ProfessorUserOpt;

const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: "contexto", label: "Contexto", hint: "Hierarquia e modelo" },
  { id: "campos", label: "Formulário", hint: "Montar perguntas" },
  { id: "config", label: "Configuração", hint: "Capa e confirmação" },
];

type Props = {
  professorUsers: UserOpt[];
};

export function FormularioWizard({ professorUsers }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("contexto");

  const [tipo, setTipo] = useState<TipoForm>("INSCRICAO");
  const [selContextoId, setSelContextoId] = useState("");
  const [selProjetoId, setSelProjetoId] = useState("");
  const [selAcaoId, setSelAcaoId] = useState("");
  const [contextos, setContextos] = useState<ContextoSelectOption[]>([]);
  const [projetos, setProjetos] = useState<ProjetoSelectOption[]>([]);
  const [acoes, setAcoes] = useState<AcaoSelectOption[]>([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyPhase, setHierarchyPhase] = useState<"select" | "register">(
    "select",
  );
  const [newAcaoNome, setNewAcaoNome] = useState("");
  const [newAcaoModalidade, setNewAcaoModalidade] = useState(
    emptyAcaoModalidade,
  );

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [campos, setCampos] = useState<FormularioCampoDraft[]>([]);
  const [abreEm, setAbreEm] = useState("");
  const [encerraEm, setEncerraEm] = useState("");
  const [capaUrl, setCapaUrl] = useState("");
  const [mensagemConfirmacao, setMensagemConfirmacao] = useState("");
  const [professores, setProfessores] = useState<string[]>([]);
  const [modeloLoaded, setModeloLoaded] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const missingContexto = !selContextoId;
  const missingProjeto = !selProjetoId;
  const needCreateAcao = !selAcaoId;
  const hierarchyComplete = Boolean(selContextoId && selProjetoId && selAcaoId);
  const canRegister = !missingProjeto && needCreateAcao;
  const selAcao = acoes.find((o) => o.id === selAcaoId);
  const selAcaoSemTerritorio = selAcao
    ? acaoSemTerritorio(selAcao)
    : false;




  const acaoLabel = useMemo(() => {
    const o = acoes.find((x) => x.id === selAcaoId);
    if (!o) {
      const ctx = contextos.find((c) => c.id === selContextoId)?.nome;
      const proj = projetos.find((p) => p.id === selProjetoId)?.nome;
      if (ctx && proj && newAcaoNome) {
        return `${ctx} · ${proj} · ${newAcaoNome}`;
      }
      return "";
    }
    return `${o.contextoNome} · ${o.projetoNome} · ${o.nome}`;
  }, [
    contextos,
    acoes,
    newAcaoNome,
    projetos,
    selContextoId,
    selAcaoId,
    selProjetoId,
  ]);

  useEffect(() => {
    if (step !== "contexto") return;
    let cancelled = false;
    setHierarchyLoading(true);
    void listContextosSelectAction()
      .then((rows) => {
        if (!cancelled) setContextos(rows);
      })
      .finally(() => {
        if (!cancelled) setHierarchyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (step !== "contexto" || !selContextoId) {
      setProjetos([]);
      return;
    }
    let cancelled = false;
    setHierarchyLoading(true);
    void listProjetosSelectAction({ contextoId: selContextoId })
      .then((rows) => {
        if (!cancelled) setProjetos(rows);
      })
      .finally(() => {
        if (!cancelled) setHierarchyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, selContextoId]);

  useEffect(() => {
    if (step !== "contexto" || !selProjetoId) {
      setAcoes([]);
      return;
    }
    let cancelled = false;
    setHierarchyLoading(true);
    void listAcoesSelectAction({ projetoId: selProjetoId })
      .then((rows) => {
        if (!cancelled) setAcoes(rows);
      })
      .finally(() => {
        if (!cancelled) setHierarchyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, selProjetoId]);

  function applyContextoPick(contextoId: string | null) {
    const id = contextoId?.trim() || "";
    setSelContextoId(id);
    setSelProjetoId("");
    setSelAcaoId("");
    setHierarchyPhase("select");
  }

  function applyProjeto(projetoId: string | null) {
    const id = projetoId?.trim() || "";
    setSelProjetoId(id);
    setSelAcaoId("");
    setHierarchyPhase("select");
    if (!id) return;
    const p = projetos.find((x) => x.id === id);
    if (p) setSelContextoId(p.contextoId);
  }

  function applyAcao(acaoId: string | null) {
    const id = acaoId && acaoId !== "__blank__" ? acaoId : "";
    if (!id) {
      setSelAcaoId("");
      setHierarchyPhase("select");
      return;
    }
    const found = acoes.find((o) => o.id === id);
    if (!found) return;
    setSelAcaoId(id);
    setSelProjetoId(found.projetoId);
    setSelContextoId(found.contextoId);
    setHierarchyPhase("select");
  }

  async function loadModelo(nextTipo: TipoForm) {
    const modelo = await getFormularioModeloByTipoAction(nextTipo);
    setTitulo(modelo.tituloDefault);
    setDescricao(modelo.descricaoDefault);
    setMensagemConfirmacao(modelo.mensagemConfirmacao);
    setCapaUrl(modelo.capaUrlDefault);
    setCampos(modelo.campos);
    setModeloLoaded(true);
  }

  async function proceedToCampos() {
    if (!modeloLoaded) await loadModelo(tipo);
    setStep("campos");
    setHierarchyPhase("select");
  }

  function goCampos() {
    start(async () => {
      try {
        if (hierarchyComplete && hierarchyPhase === "select") {
          if (selAcaoSemTerritorio) {
            toast.error(
              "Esta ação não tem território. Edite a ação em Contextos e informe onde ela acontece.",
            );
            return;
          }
          await proceedToCampos();
          return;
        }

        if (hierarchyPhase === "select") {
          if (!canRegister) {
            toast.error(
              missingContexto
                ? "Selecione um contexto"
                : missingProjeto
                  ? "Selecione ou cadastre um projeto."
                  : "Selecione contexto, projeto e ação",
            );
            return;
          }
          setHierarchyPhase("register");
          return;
        }

        if (missingProjeto) {
          toast.error(
            "Selecione um projeto antes de cadastrar a ação.",
          );
          return;
        }
        if (!newAcaoNome.trim()) {
          toast.error("Preencha o nome da ação");
          return;
        }

        const createdOf = await createAcaoAction({
          projetoId: selProjetoId,
          nome: newAcaoNome,
          ofereceOnline: newAcaoModalidade.ofereceOnline,
          oferecePresencial: newAcaoModalidade.oferecePresencial,
          territorios: territoriosPayload(newAcaoModalidade),
        });
        if (!createdOf.ok) {
          toast.error(createdOf.error);
          return;
        }
        setAcoes((prev) => [acaoDtoToOption(createdOf.acao), ...prev]);
        setSelContextoId(createdOf.acao.contextoId);
        setSelProjetoId(createdOf.acao.projetoId);
        setSelAcaoId(createdOf.acao.id);
        setNewAcaoNome("");
        setNewAcaoModalidade(emptyAcaoModalidade());
        toast.success("Ação cadastrada");
        router.refresh();
        await proceedToCampos();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Falha ao cadastrar hierarquia",
        );
      }
    });
  }

  function onTipoChange(next: TipoForm) {
    setTipo(next);
    setModeloLoaded(false);
    start(async () => {
      try {
        await loadModelo(next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao carregar modelo");
      }
    });
  }

  function publish() {
    if (!titulo.trim()) {
      toast.error("Informe o título");
      return;
    }
    if (!selAcaoId) {
      toast.error("Ação obrigatória");
      return;
    }
    start(async () => {
      try {
        const created = await createFormularioAction({
          acaoId: selAcaoId,
          tipo,
          titulo,
          descricao,
          abreEm: abreEm || null,
          encerraEm: encerraEm || null,
          capaUrl,
          mensagemConfirmacao,
          campos,
        });
        if (professores.length) {
          await setAcaoResponsavelesAction(selAcaoId, professores);
        }
        toast.success("Formulário criado");
        router.push(`/dashboard/formularios/${created.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao criar");
      }
    });
  }

  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const done = i < stepIndex;
          return (
            <li
              key={s.id}
              className={cn(
                "min-w-0 rounded-lg border px-2.5 py-2 text-xs sm:px-3 sm:text-sm",
                active && "border-brand-deep bg-brand-deep/5 text-brand-deep",
                done && !active && "border-border bg-muted/30 text-muted-foreground",
                !active && !done && "border-border/60 text-muted-foreground",
              )}
            >
              <span className="font-medium">
                {i + 1}. {s.label}
              </span>
              <span className="ml-2 hidden text-xs opacity-80 sm:inline">{s.hint}</span>
            </li>
          );
        })}
      </ol>

      {step === "contexto" ? (
        <section className="space-y-5 rounded-lg border border-border/80 bg-card p-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-brand-deep">
              Hierarquia e modelo
            </h2>
            <p className="text-sm text-muted-foreground">
              Escolha ou cadastre contexto → projeto → ação e o modelo base.
              A ação informa onde acontece (online e/ou territórios).
            </p>
          </div>

          <div className="space-y-1">
            <Label>Modelo *</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    id: "INSCRICAO" as const,
                    title: "Inscrição",
                    desc: "Coleta dados para a base completa",
                  },
                  {
                    id: "AVALIACAO" as const,
                    title: "Avaliação",
                    desc: "Feedback pós-ação vinculado ao CPF",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onTipoChange(opt.id)}
                  className={cn(
                    "rounded-lg border px-3 py-3 text-left transition-colors",
                    tipo === opt.id
                      ? "border-brand-deep bg-brand-deep/5"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <p className="font-medium text-sm">{opt.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Link
              href="/dashboard/contextos"
              className="text-sm text-brand underline-offset-4 hover:underline"
            >
              Gerenciar hierarquia
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {hierarchyLoading ? (
              <p className="text-sm text-muted-foreground sm:col-span-3">
                Carregando opções…
              </p>
            ) : null}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Contexto *</Label>
                <NovoContextoButton
                  disabled={hierarchyLoading}
                  onCreated={(c) => {
                    setContextos((prev) => [c, ...prev]);
                    applyContextoPick(c.id);
                  }}
                />
              </div>
              <SearchSelect
                value={selContextoId}
                options={contextos.map((c) => ({
                  value: c.id,
                  label: c.nome.trim() || "(sem nome)",
                }))}
                onValueChange={(v) => applyContextoPick(v)}
                disabled={hierarchyLoading}
                placeholder={contextos.length === 0 ? "Nenhum contexto" : "Selecione…"}
                searchPlaceholder="Buscar contexto…"
                emptyText="Nenhum contexto encontrado."
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Projeto *</Label>
                <NovoProjetoButton
                  contextoId={selContextoId}
                  disabled={hierarchyLoading}
                  onCreated={(p) => {
                    setProjetos((prev) => [
                      { id: p.id, nome: p.nome, pronac: p.pronac, contextoId: p.contextoId },
                      ...prev,
                    ]);
                    applyProjeto(p.id);
                  }}
                />
              </div>
              <SearchSelect
                value={selProjetoId}
                options={projetos.map((p) => ({
                  value: p.id,
                  label: p.nome,
                  hint: p.pronac ? `PRONAC ${p.pronac}` : undefined,
                }))}
                onValueChange={(v) => applyProjeto(v)}
                disabled={missingContexto || hierarchyLoading}
                placeholder={
                  missingContexto
                    ? "Selecione o contexto primeiro"
                    : projetos.length === 0
                      ? "Nenhum projeto neste contexto"
                      : "Selecione…"
                }
                searchPlaceholder="Buscar projeto ou PRONAC…"
                emptyText="Nenhum projeto encontrado."
              />
            </div>
            <div className="space-y-1">
              <Label>Ação *</Label>
              <SearchSelect
                value={selAcaoId || "__blank__"}
                options={[
                  { value: "__blank__", label: "+ Cadastrar nova ação" },
                  ...acoes.map((o) => ({
                    value: o.id,
                    label: o.nome,
                    hint: acaoOndeLabel(o) || undefined,
                  })),
                ]}
                onValueChange={(v) => applyAcao(v)}
                disabled={missingProjeto || hierarchyLoading}
                placeholder={missingProjeto ? "Selecione o projeto primeiro" : "Selecione…"}
                searchPlaceholder="Buscar ação ou cidade…"
                emptyText="Nenhuma ação encontrada."
              />
              {selAcao ? (
                selAcaoSemTerritorio ? (
                  <p className="text-xs text-destructive">
                    Sem território cadastrado.{" "}
                    <Link
                      href="/dashboard/contextos?tab=acoes"
                      className="underline underline-offset-2"
                    >
                      Editar ação
                    </Link>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Onde: {acaoOndeLabel(selAcao)}
                  </p>
                )
              ) : null}
            </div>
          </div>

          {!hierarchyComplete ? (
            <p className="text-sm text-muted-foreground">
              {[
                missingContexto ? "selecionar contexto" : null,
                missingProjeto ? "selecionar ou cadastrar projeto" : null,
                !missingProjeto && needCreateAcao
                  ? "cadastrar ou selecionar ação"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {canRegister
                ? ". Clique em Continuar para cadastrar a ação."
                : "."}
            </p>
          ) : null}

          {hierarchyPhase === "register" && canRegister ? (
            <div className="space-y-4 rounded-xl border border-brand/20 bg-[var(--navy-soft)]/70 p-4">
              <p className="text-sm font-medium text-brand-deep">
                Cadastrar nova ação
              </p>
              <div className="space-y-2">
                <Label htmlFor="formNewAcao">Nome da ação</Label>
                <Input
                  id="formNewAcao"
                  value={newAcaoNome}
                  onChange={(e) => setNewAcaoNome(e.target.value)}
                />
              </div>
              <AcaoModalidadeFields
                value={newAcaoModalidade}
                onChange={setNewAcaoModalidade}
              />
            </div>
          ) : null}

          <div className="flex justify-between gap-2">
            {hierarchyPhase === "register" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setHierarchyPhase("select")}
              >
                Voltar
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              disabled={
                pending ||
                (hierarchyPhase === "register" && !newAcaoNome.trim())
              }
              onClick={goCampos}
            >
              {hierarchyPhase === "select" && !hierarchyComplete && canRegister
                ? "Continuar e cadastrar"
                : "Continuar"}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "campos" ? (
        <section className="space-y-5">
          <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-brand-deep">
                Montar formulário
              </h2>
              <p className="text-sm text-muted-foreground">
                {acaoLabel} · modelo {tipo === "INSCRICAO" ? "Inscrição" : "Avaliação"}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Título *</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Descrição / introdução</Label>
              <Textarea
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-heading text-base font-semibold text-brand-deep">
              Perguntas
            </h3>
            <CampoEditor campos={campos} onChange={setCampos} />
          </div>

          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("contexto")}>
              Voltar
            </Button>
            <Button
              type="button"
              disabled={!titulo.trim()}
              onClick={() => setStep("config")}
            >
              Continuar
            </Button>
          </div>
        </section>
      ) : null}

      {step === "config" ? (
        <section className="space-y-5">
          <div className="rounded-lg border border-border/80 bg-card p-4 space-y-4">
            <div>
              <h2 className="font-heading text-lg font-semibold text-brand-deep">
                Configuração e confirmação
              </h2>
              <p className="text-sm text-muted-foreground">
                Datas, capa e mensagem exibida após o envio.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Abre em</Label>
                <Input
                  type="datetime-local"
                  value={abreEm}
                  onChange={(e) => setAbreEm(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Encerra em</Label>
                <Input
                  type="datetime-local"
                  value={encerraEm}
                  onChange={(e) => setEncerraEm(e.target.value)}
                />
              </div>
            </div>
            <CapaField value={capaUrl} onChange={setCapaUrl} />
            <div className="space-y-1">
              <Label>Mensagem de confirmação</Label>
              <Textarea
                rows={4}
                value={mensagemConfirmacao}
                onChange={(e) => setMensagemConfirmacao(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3">
            <h3 className="font-heading text-base font-semibold text-brand-deep">
              Professores da ação
            </h3>
            <p className="text-sm text-muted-foreground">
              Usuários com o papel <strong>Professor</strong> que veem as
              respostas desta ação e podem marcar Selecionado / Professor.
            </p>
            <ProfessorPicker
              users={professorUsers}
              value={professores}
              onChange={setProfessores}
            />
            {professorUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum usuário com papel Professor. Crie o login no hub e
                atribua o papel Professor.
              </p>
            ) : null}
          </div>

          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("campos")}>
              Voltar
            </Button>
            <Button type="button" disabled={pending} onClick={publish}>
              {pending ? "Criando…" : "Criar formulário"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
