"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createContextoAction,
  createProjetoAction,
} from "@/app/actions/contextos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ContextoSelectOption,
  OficinaSelectOption,
} from "@/lib/hierarchy-list";
import type { OficinaDTO, ProjetoDTO } from "@/lib/contexto";

/** Cadastro rápido de contexto (importação e formulários). */
export function NovoContextoButton({
  disabled,
  onCreated,
}: {
  disabled?: boolean;
  onCreated: (c: ContextoSelectOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const r = await createContextoAction({ nome });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Contexto cadastrado");
      onCreated({ id: r.contexto.id, nome: r.contexto.nome });
      setNome("");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto gap-1 px-0 text-xs"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3" />
        Novo contexto
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo contexto</DialogTitle>
            <DialogDescription>
              Programa que agrupa os projetos (ex.: &quot;Arte em cores&quot;).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending || !nome.trim()} onClick={save}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Cadastro rápido de projeto dentro de um contexto (PRONAC opcional). */
export function NovoProjetoButton({
  contextoId,
  disabled,
  onCreated,
}: {
  contextoId: string;
  disabled?: boolean;
  onCreated: (p: ProjetoDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    pronac: "",
    proponente: "",
    ano: String(new Date().getFullYear()),
  });
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const r = await createProjetoAction({ contextoId, ...form });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Projeto cadastrado");
      onCreated(r.projeto);
      setForm((f) => ({ ...f, nome: "", pronac: "", proponente: "" }));
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto gap-1 px-0 text-xs"
        disabled={disabled || !contextoId}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3" />
        Novo projeto
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
            <DialogDescription>
              O projeto fica dentro do contexto selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome do projeto</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Arte em Rede 1ª Edição"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Proponente</Label>
              <Input
                value={form.proponente}
                onChange={(e) =>
                  setForm((f) => ({ ...f, proponente: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>PRONAC (opcional)</Label>
              <Input
                value={form.pronac}
                onChange={(e) => setForm((f) => ({ ...f, pronac: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input
                value={form.ano}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    ano: e.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending || !form.nome.trim()} onClick={save}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** OficinaDTO → opção de select (mantém modalidade e territórios). */
export function oficinaDtoToOption(o: OficinaDTO): OficinaSelectOption {
  return {
    id: o.id,
    nome: o.nome,
    projetoId: o.projetoId,
    projetoNome: o.projetoNome,
    contextoId: o.contextoId,
    contextoNome: o.contextoNome,
    pronac: o.pronac,
    proponente: o.proponente,
    ano: o.ano,
    ofereceOnline: o.ofereceOnline,
    oferecePresencial: o.oferecePresencial,
    territorios: o.territorios.map((t) => ({
      id: t.id,
      nome: t.nome,
      cidade: t.cidade,
      estado: t.estado,
    })),
  };
}

/** Texto curto de onde a oficina acontece. */
export function oficinaOndeLabel(o: {
  ofereceOnline?: boolean;
  oferecePresencial?: boolean;
  territorios?: Array<{ nome: string; cidade: string; estado: string }>;
}): string {
  const parts: string[] = [];
  if (o.ofereceOnline) parts.push("Online");
  if (o.oferecePresencial !== false) {
    for (const t of o.territorios ?? []) {
      const lugar = `${t.cidade}/${t.estado}`;
      parts.push(t.nome ? `${t.nome} (${lugar})` : lugar);
    }
  }
  return parts.join(" · ");
}

/** Oficina sem modalidade definida (presencial sem território): não serve para formulário/importação. */
export function oficinaSemTerritorio(o: {
  ofereceOnline?: boolean;
  oferecePresencial?: boolean;
  territorios?: unknown[];
}): boolean {
  if (o.ofereceOnline) return false;
  return (o.territorios ?? []).length === 0;
}
