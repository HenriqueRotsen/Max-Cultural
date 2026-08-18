"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  createContextoAction,
  createOficinaAction,
  createProjetoAction,
  deleteContextoAction,
  deleteOficinaAction,
  deleteProjetoAction,
  updateContextoAction,
  updateOficinaAction,
  updateProjetoAction,
} from "@/app/actions/contextos";
import type {
  ContextoDTO,
  OficinaDTO,
  ProjetoDTO,
} from "@/lib/contexto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Tab = "contextos" | "projetos" | "oficinas";

type Props = {
  initialContextos: ContextoDTO[];
  initialProjetos: ProjetoDTO[];
  initialOficinas: OficinaDTO[];
  canCreate?: boolean;
  canWrite?: boolean;
};

export function ContextosManager({
  initialContextos,
  initialProjetos,
  initialOficinas,
  canCreate = false,
  canWrite = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("contextos");
  const [contextos, setContextos] = useState(initialContextos);
  const [projetos, setProjetos] = useState(initialProjetos);
  const [oficinas, setOficinas] = useState(initialOficinas);

  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctxEditId, setCtxEditId] = useState<string | null>(null);
  const [ctxNome, setCtxNome] = useState("");

  const [projOpen, setProjOpen] = useState(false);
  const [projEditId, setProjEditId] = useState<string | null>(null);
  const [projForm, setProjForm] = useState({
    contextoId: "",
    nome: "",
    pronac: "",
    proponente: "",
    ano: String(new Date().getFullYear()),
  });

  const [ofOpen, setOfOpen] = useState(false);
  const [ofEditId, setOfEditId] = useState<string | null>(null);
  const [ofForm, setOfForm] = useState({
    contextoId: "",
    projetoId: "",
    nome: "",
  });

  useEffect(() => {
    setContextos(initialContextos);
    setProjetos(initialProjetos);
    setOficinas(initialOficinas);
  }, [initialContextos, initialProjetos, initialOficinas]);

  const projetosDoContexto = useMemo(
    () =>
      ofForm.contextoId
        ? projetos.filter((p) => p.contextoId === ofForm.contextoId)
        : projetos,
    [projetos, ofForm.contextoId],
  );

  const contextosEditaveis = useMemo(
    () => contextos.filter((c) => c.hasEditorAccess),
    [contextos],
  );
  const projetosEditaveis = useMemo(
    () =>
      (ofForm.contextoId
        ? projetos.filter((p) => p.contextoId === ofForm.contextoId)
        : projetos
      ).filter((p) => p.hasEditorAccess),
    [projetos, ofForm.contextoId],
  );

  const contextoSelectItems = useMemo(
    () =>
      Object.fromEntries(
        contextosEditaveis.map((c) => [c.id, c.nome.trim() || "(sem nome)"]),
      ),
    [contextosEditaveis],
  );

  const projetoSelectItems = useMemo(
    () =>
      Object.fromEntries(
        projetosEditaveis.map((p) => [
          p.id,
          p.pronac ? `${p.nome} · ${p.pronac}` : p.nome,
        ]),
      ),
    [projetosEditaveis],
  );

  function openCreateCtx() {
    setCtxEditId(null);
    setCtxNome("");
    setCtxOpen(true);
  }

  function openEditCtx(c: ContextoDTO) {
    setCtxEditId(c.id);
    setCtxNome(c.nome);
    setCtxOpen(true);
  }

  async function saveCtx() {
    startTransition(async () => {
      if (ctxEditId) {
        const r = await updateContextoAction(ctxEditId, { nome: ctxNome });
        if (!r.ok) { toast.error(r.error); return; }
        setContextos((prev) =>
          prev.map((c) => (c.id === ctxEditId ? r.contexto : c)),
        );
        toast.success("Contexto atualizado");
      } else {
        const r = await createContextoAction({ nome: ctxNome });
        if (!r.ok) { toast.error(r.error); return; }
        setContextos((prev) =>
          [...prev, r.contexto].sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR"),
          ),
        );
        toast.success("Contexto criado");
      }
      setCtxOpen(false);
    });
  }

  async function removeCtx(id: string) {
    startTransition(async () => {
      const r = await deleteContextoAction(id);
      if (!r.ok) { toast.error(r.error); return; }
      setContextos((prev) => prev.filter((c) => c.id !== id));
      toast.success("Contexto excluído");
    });
  }

  function openCreateProj() {
    setProjEditId(null);
    setProjForm({
      contextoId: contextos[0]?.id ?? "",
      nome: "",
      pronac: "",
      proponente: "",
      ano: String(new Date().getFullYear()),
    });
    setProjOpen(true);
  }

  function openEditProj(p: ProjetoDTO) {
    setProjEditId(p.id);
    setProjForm({
      contextoId: p.contextoId,
      nome: p.nome,
      pronac: p.pronac,
      proponente: p.proponente,
      ano: p.ano,
    });
    setProjOpen(true);
  }

  async function saveProj() {
    startTransition(async () => {
      if (projEditId) {
        const r = await updateProjetoAction(projEditId, projForm);
        if (!r.ok) { toast.error(r.error); return; }
        setProjetos((prev) =>
          prev.map((p) => (p.id === projEditId ? r.projeto : p)),
        );
        toast.success("Projeto atualizado");
      } else {
        const r = await createProjetoAction(projForm);
        if (!r.ok) { toast.error(r.error); return; }
        setProjetos((prev) =>
          [...prev, r.projeto].sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR"),
          ),
        );
        setContextos((prev) =>
          prev.map((c) =>
            c.id === r.projeto.contextoId
              ? { ...c, projetosCount: c.projetosCount + 1 }
              : c,
          ),
        );
        toast.success("Projeto criado");
      }
      setProjOpen(false);
    });
  }

  async function removeProj(id: string) {
    startTransition(async () => {
      const r = await deleteProjetoAction(id);
      if (!r.ok) { toast.error(r.error); return; }
      const removed = projetos.find((p) => p.id === id);
      setProjetos((prev) => prev.filter((p) => p.id !== id));
      if (removed) {
        setContextos((prev) =>
          prev.map((c) =>
            c.id === removed.contextoId
              ? { ...c, projetosCount: Math.max(0, c.projetosCount - 1) }
              : c,
          ),
        );
      }
      toast.success("Projeto excluído");
    });
  }

  function openCreateOf() {
    const ctxId = contextos[0]?.id ?? "";
    const firstProj = projetos.find((p) => p.contextoId === ctxId);
    setOfEditId(null);
    setOfForm({
      contextoId: ctxId,
      projetoId: firstProj?.id ?? "",
      nome: "",
    });
    setOfOpen(true);
  }

  function openEditOf(o: OficinaDTO) {
    setOfEditId(o.id);
    setOfForm({
      contextoId: o.contextoId,
      projetoId: o.projetoId,
      nome: o.nome,
    });
    setOfOpen(true);
  }

  async function saveOf() {
    startTransition(async () => {
      if (ofEditId) {
        const r = await updateOficinaAction(ofEditId, {
          projetoId: ofForm.projetoId,
          nome: ofForm.nome,
        });
        if (!r.ok) { toast.error(r.error); return; }
        setOficinas((prev) =>
          prev.map((o) => (o.id === ofEditId ? r.oficina : o)),
        );
        toast.success("Oficina atualizada");
      } else {
        const r = await createOficinaAction({
          projetoId: ofForm.projetoId,
          nome: ofForm.nome,
        });
        if (!r.ok) { toast.error(r.error); return; }
        setOficinas((prev) =>
          [...prev, r.oficina].sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR"),
          ),
        );
        setProjetos((prev) =>
          prev.map((p) =>
            p.id === r.oficina.projetoId
              ? { ...p, oficinasCount: p.oficinasCount + 1 }
              : p,
          ),
        );
        toast.success("Oficina criada");
      }
      setOfOpen(false);
    });
  }

  async function removeOf(id: string) {
    startTransition(async () => {
      const r = await deleteOficinaAction(id);
      if (!r.ok) { toast.error(r.error); return; }
      const removed = oficinas.find((o) => o.id === id);
      setOficinas((prev) => prev.filter((o) => o.id !== id));
      if (removed) {
        setProjetos((prev) =>
          prev.map((p) =>
            p.id === removed.projetoId
              ? { ...p, oficinasCount: Math.max(0, p.oficinasCount - 1) }
              : p,
          ),
        );
      }
      toast.success("Oficina excluída");
    });
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "contextos", label: "Contextos" },
    { id: "projetos", label: "Projetos" },
    { id: "oficinas", label: "Oficinas" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-brand/10 bg-white/80 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition",
                tab === t.id
                  ? "bg-brand-soft font-medium text-brand-deep"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {canCreate ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (tab === "contextos") openCreateCtx();
              else if (tab === "projetos") openCreateProj();
              else openCreateOf();
            }}
          >
            <Plus className="size-3.5" />
            Novo
          </Button>
        ) : null}
      </div>

      {tab === "contextos" ? (
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
          <ul className="divide-y divide-border/60">
            {contextos.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum contexto. Crie o programa (topo da hierarquia).
              </li>
            ) : (
              contextos.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium text-brand-deep">
                      {c.nome || "(sem nome)"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.projetosCount} projeto(s)
                      {c.inscricoesCount > 0
                        ? ` · ${c.inscricoesCount} inscrição(ões)`
                        : ""}
                      {!c.canEdit && !c.hasEditorAccess
                        ? " · somente leitura"
                        : !c.canDelete && (c.canEdit || c.hasEditorAccess)
                          ? " · exclusão bloqueada (há dados)"
                          : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {c.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={() => openEditCtx(c)}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    ) : null}
                    {c.canEdit || c.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-destructive"
                        disabled={pending || !c.canDelete}
                        title={
                          c.canDelete
                            ? "Excluir"
                            : "Há projetos ou inscrições vinculadas"
                        }
                        onClick={() => removeCtx(c.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Excluir
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {tab === "projetos" ? (
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
          <ul className="divide-y divide-border/60">
            {projetos.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum projeto. Vincule um projeto a um contexto (com PRONAC).
              </li>
            ) : (
              projetos.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {p.contextoNome || "(contexto)"}
                    </div>
                    <div className="font-medium text-brand-deep">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      PRONAC {p.pronac}
                      {p.ano ? ` · ${p.ano}` : ""} · {p.oficinasCount} oficina(s)
                      {p.inscricoesCount > 0
                        ? ` · ${p.inscricoesCount} inscrição(ões)`
                        : ""}
                      {!p.canEdit && !p.hasEditorAccess
                        ? " · somente leitura"
                        : !p.canDelete && (p.canEdit || p.hasEditorAccess)
                          ? " · exclusão bloqueada (há dados)"
                          : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {p.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={() => openEditProj(p)}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    ) : null}
                    {p.canEdit || p.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-destructive"
                        disabled={pending || !p.canDelete}
                        title={
                          p.canDelete
                            ? "Excluir"
                            : "Há oficinas ou inscrições vinculadas"
                        }
                        onClick={() => removeProj(p.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Excluir
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {tab === "oficinas" ? (
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
          <ul className="divide-y divide-border/60">
            {oficinas.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma oficina. Vincule a um projeto.
              </li>
            ) : (
              oficinas.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {o.contextoNome || "(contexto)"} → {o.projetoNome}
                    </div>
                    <div className="font-medium text-brand-deep">{o.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.inscricoesCount > 0
                        ? `${o.inscricoesCount} inscrição(ões)`
                        : "Sem inscrições"}
                      {!o.canEdit && !o.hasEditorAccess
                        ? " · somente leitura"
                        : !o.canDelete && (o.canEdit || o.hasEditorAccess)
                          ? " · exclusão bloqueada (há dados)"
                          : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {o.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={() => openEditOf(o)}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    ) : null}
                    {o.canEdit || o.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-destructive"
                        disabled={pending || !o.canDelete}
                        title={
                          o.canDelete
                            ? "Excluir"
                            : "Há inscrições vinculadas"
                        }
                        onClick={() => removeOf(o.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Excluir
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      <Dialog open={ctxOpen} onOpenChange={setCtxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ctxEditId ? "Editar contexto" : "Novo contexto"}
            </DialogTitle>
            <DialogDescription>
              Topo da hierarquia (programa). O nome é obrigatório.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="ctx-nome">Nome do contexto</Label>
            <Input
              id="ctx-nome"
              value={ctxNome}
              placeholder="Ex.: Arte em Rede"
              onChange={(e) => setCtxNome(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCtxOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || !ctxNome.trim()}
              onClick={saveCtx}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={projOpen} onOpenChange={setProjOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {projEditId ? "Editar projeto" : "Novo projeto"}
            </DialogTitle>
            <DialogDescription>
              Cada projeto pertence a um contexto e precisa de PRONAC.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Contexto</Label>
              <Select
                value={projForm.contextoId || undefined}
                onValueChange={(v) =>
                  setProjForm((f) => ({ ...f, contextoId: v ?? "" }))
                }
                items={contextoSelectItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {contextosEditaveis.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome || "(sem nome)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome do projeto</Label>
              <Input
                value={projForm.nome}
                onChange={(e) =>
                  setProjForm((f) => ({ ...f, nome: e.target.value }))
                }
                placeholder="Ex.: Arte em Rede 1ª Edição"
              />
            </div>
            <div className="space-y-1.5">
              <Label>PRONAC</Label>
              <Input
                value={projForm.pronac}
                onChange={(e) =>
                  setProjForm((f) => ({ ...f, pronac: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Proponente</Label>
              <Input
                value={projForm.proponente}
                onChange={(e) =>
                  setProjForm((f) => ({ ...f, proponente: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input
                value={projForm.ano}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) =>
                  setProjForm((f) => ({
                    ...f,
                    ano: e.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProjOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending} onClick={saveProj}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ofOpen} onOpenChange={setOfOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ofEditId ? "Editar oficina" : "Nova oficina"}
            </DialogTitle>
            <DialogDescription>
              A oficina fica vinculada a um único projeto (e ao contexto dele).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Contexto</Label>
              <Select
                value={ofForm.contextoId || undefined}
                onValueChange={(v) => {
                  const contextoId = v ?? "";
                  const first = projetos.find(
                    (p) =>
                      p.contextoId === contextoId && p.hasEditorAccess,
                  );
                  setOfForm((f) => ({
                    ...f,
                    contextoId,
                    projetoId: first?.id ?? "",
                  }));
                }}
                items={contextoSelectItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {contextosEditaveis.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome || "(sem nome)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select
                value={ofForm.projetoId || undefined}
                onValueChange={(v) =>
                  setOfForm((f) => ({ ...f, projetoId: v ?? "" }))
                }
                items={projetoSelectItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {projetosEditaveis.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome da oficina</Label>
              <Input
                value={ofForm.nome}
                onChange={(e) =>
                  setOfForm((f) => ({ ...f, nome: e.target.value }))
                }
                placeholder="Ex.: Oficina de IA"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOfOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending} onClick={saveOf}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
