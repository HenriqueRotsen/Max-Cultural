"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOficinaAction,
  listContextosSelectAction,
  listOficinasSelectAction,
  listProjetosSelectAction,
} from "@/app/actions/contextos";
import {
  createFormularioAction,
  getFormularioModeloByTipoAction,
  setOficinaProfessoresAction,
} from "@/app/actions/formularios";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FormularioCampoDraft } from "@/lib/formularios/types";
import type {
  ContextoSelectOption,
  OficinaSelectOption,
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
  const [selOficinaId, setSelOficinaId] = useState("");
  const [contextos, setContextos] = useState<ContextoSelectOption[]>([]);
  const [projetos, setProjetos] = useState<ProjetoSelectOption[]>([]);
  const [oficinas, setOficinas] = useState<OficinaSelectOption[]>([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyPhase, setHierarchyPhase] = useState<"select" | "register">(
    "select",
  );
  const [newOficinaNome, setNewOficinaNome] = useState("");

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
  const needCreateOficina = !selOficinaId;
  const hierarchyComplete = Boolean(selContextoId && selProjetoId && selOficinaId);
  const canRegister = !missingProjeto && needCreateOficina;

  const contextoSelectItems = useMemo(
    () =>
      Object.fromEntries(
        contextos.map((c) => [c.id, c.nome.trim() || "(sem nome)"]),
      ),
    [contextos],
  );

  const projetoSelectItems = useMemo(
    () =>
      Object.fromEntries(
        projetos.map((p) => [
          p.id,
          p.pronac ? `${p.nome} · ${p.pronac}` : p.nome,
        ]),
      ),
    [projetos],
  );

  const oficinaSelectItems = useMemo(
    () => ({
      __blank__: "Cadastrar Novo",
      ...Object.fromEntries(oficinas.map((o) => [o.id, o.nome])),
    }),
    [oficinas],
  );

  const oficinaLabel = useMemo(() => {
    const o = oficinas.find((x) => x.id === selOficinaId);
    if (!o) {
      const ctx = contextos.find((c) => c.id === selContextoId)?.nome;
      const proj = projetos.find((p) => p.id === selProjetoId)?.nome;
      if (ctx && proj && newOficinaNome) {
        return `${ctx} · ${proj} · ${newOficinaNome}`;
      }
      return "";
    }
    return `${o.contextoNome} · ${o.projetoNome} · ${o.nome}`;
  }, [
    contextos,
    oficinas,
    newOficinaNome,
    projetos,
    selContextoId,
    selOficinaId,
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
      setOficinas([]);
      return;
    }
    let cancelled = false;
    setHierarchyLoading(true);
    void listOficinasSelectAction({ projetoId: selProjetoId })
      .then((rows) => {
        if (!cancelled) setOficinas(rows);
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
    setSelOficinaId("");
    setHierarchyPhase("select");
  }

  function applyProjeto(projetoId: string | null) {
    const id = projetoId?.trim() || "";
    setSelProjetoId(id);
    setSelOficinaId("");
    setHierarchyPhase("select");
    if (!id) return;
    const p = projetos.find((x) => x.id === id);
    if (p) setSelContextoId(p.contextoId);
  }

  function applyOficina(oficinaId: string | null) {
    const id = oficinaId && oficinaId !== "__blank__" ? oficinaId : "";
    if (!id) {
      setSelOficinaId("");
      setHierarchyPhase("select");
      return;
    }
    const found = oficinas.find((o) => o.id === id);
    if (!found) return;
    setSelOficinaId(id);
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
          await proceedToCampos();
          return;
        }

        if (hierarchyPhase === "select") {
          if (!canRegister) {
            toast.error(
              missingContexto
                ? "Selecione um contexto"
                : missingProjeto
                  ? "Selecione um projeto. Projetos são criados no MAX Origem."
                  : "Selecione contexto, projeto e oficina",
            );
            return;
          }
          setHierarchyPhase("register");
          return;
        }

        if (missingProjeto) {
          toast.error(
            "Selecione um projeto antes de cadastrar a oficina. Projetos vêm do MAX Origem.",
          );
          return;
        }
        if (!newOficinaNome.trim()) {
          toast.error("Preencha o nome da oficina");
          return;
        }

        const createdOf = await createOficinaAction({
          projetoId: selProjetoId,
          nome: newOficinaNome,
        });
        if (!createdOf.ok) {
          toast.error(createdOf.error);
          return;
        }
        setOficinas((prev) => [
          {
            id: createdOf.oficina.id,
            nome: createdOf.oficina.nome,
            projetoId: createdOf.oficina.projetoId,
            projetoNome: createdOf.oficina.projetoNome,
            contextoId: createdOf.oficina.contextoId,
            contextoNome: createdOf.oficina.contextoNome,
            pronac: createdOf.oficina.pronac,
            proponente: createdOf.oficina.proponente,
            ano: createdOf.oficina.ano,
          },
          ...prev,
        ]);
        setSelContextoId(createdOf.oficina.contextoId);
        setSelProjetoId(createdOf.oficina.projetoId);
        setSelOficinaId(createdOf.oficina.id);
        setNewOficinaNome("");
        toast.success("Oficina cadastrada");
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
    if (!selOficinaId) {
      toast.error("Oficina obrigatória");
      return;
    }
    start(async () => {
      try {
        const created = await createFormularioAction({
          oficinaId: selOficinaId,
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
          await setOficinaProfessoresAction(selOficinaId, professores);
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
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const done = i < stepIndex;
          return (
            <li
              key={s.id}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                active && "border-brand-deep bg-brand-deep/5 text-brand-deep",
                done && !active && "border-border bg-muted/30 text-muted-foreground",
                !active && !done && "border-border/60 text-muted-foreground",
              )}
            >
              <span className="font-medium">
                {i + 1}. {s.label}
              </span>
              <span className="ml-2 text-xs opacity-80">{s.hint}</span>
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
              Escolha contexto → projeto → oficina e o modelo base. Só a
              oficina pode ser cadastrada aqui.
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
                    desc: "Feedback pós-oficina vinculado ao CPF",
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
              <Label>Contexto *</Label>
              <Select
                value={selContextoId || undefined}
                onValueChange={(v) => applyContextoPick(v)}
                disabled={hierarchyLoading}
                items={contextoSelectItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      contextos.length === 0
                        ? "Nenhum contexto"
                        : "Selecione…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {contextos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome.trim() || "(sem nome)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Projeto *</Label>
              <Select
                value={selProjetoId || undefined}
                onValueChange={(v) => applyProjeto(v)}
                disabled={missingContexto || hierarchyLoading}
                items={projetoSelectItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      missingContexto
                        ? "Selecione o contexto primeiro"
                        : projetos.length === 0
                          ? "Nenhum projeto neste contexto"
                          : "Selecione…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.pronac ? `${p.nome} · ${p.pronac}` : p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!missingContexto ? (
                <p className="text-xs text-muted-foreground">
                  Projetos vêm do MAX Origem; aqui só é possível selecionar.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Oficina *</Label>
              <Select
                value={selOficinaId || "__blank__"}
                onValueChange={(v) => applyOficina(v)}
                disabled={missingProjeto || hierarchyLoading}
                items={oficinaSelectItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      missingProjeto
                        ? "Selecione o projeto primeiro"
                        : "Cadastrar Novo"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__blank__">Cadastrar Novo</SelectItem>
                  {oficinas.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!hierarchyComplete ? (
            <p className="text-sm text-muted-foreground">
              {[
                missingContexto ? "selecionar contexto" : null,
                missingProjeto ? "selecionar projeto (MAX Origem)" : null,
                !missingProjeto && needCreateOficina
                  ? "cadastrar ou selecionar oficina"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {canRegister
                ? ". Clique em Continuar para cadastrar a oficina."
                : "."}
            </p>
          ) : null}

          {hierarchyPhase === "register" && canRegister ? (
            <div className="space-y-4 rounded-xl border border-brand/20 bg-[var(--navy-soft)]/70 p-4">
              <p className="text-sm font-medium text-brand-deep">
                Cadastrar nova oficina
              </p>
              <div className="space-y-2">
                <Label htmlFor="formNewOficina">Nome da oficina</Label>
                <Input
                  id="formNewOficina"
                  value={newOficinaNome}
                  onChange={(e) => setNewOficinaNome(e.target.value)}
                />
              </div>
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
                (hierarchyPhase === "register" && !newOficinaNome.trim())
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
                {oficinaLabel} · modelo {tipo === "INSCRICAO" ? "Inscrição" : "Avaliação"}
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
              Professores da oficina
            </h3>
            <p className="text-sm text-muted-foreground">
              Usuários com o papel <strong>Professor</strong> que veem as
              respostas desta oficina e podem marcar Selecionado / Professor.
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
