"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { moverCampoAction, salvarCampoAction, setCampoAtivoAction } from "@/app/actions/prestacao";
import { EQUIPES, type EquipePrestacao, type TipoCampoPrestacao } from "@/lib/prestacao/regras";
import { EQUIPE_LABEL, TIPO_CAMPO_LABEL, type CampoDTO } from "@/lib/prestacao/types";
import { useConfirm } from "@/components/ui/confirm";

type Edicao = {
  id?: string;
  rotulo: string;
  ajuda: string;
  tipo: TipoCampoPrestacao;
  opcoes: string;
  equipe: EquipePrestacao;
  obrigatorio: boolean;
};

export function ModeloFichaEditor({ campos, pode }: { campos: CampoDTO[]; pode: boolean }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [verRemovidos, setVerRemovidos] = useState(false);
  const removidos = campos.filter((c) => !c.ativo);

  function acao(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok?: string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/dashboard/prestacao" className="text-xs text-muted-foreground hover:text-brand-deep">
          ← Prestação de contas
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configurações</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">Modelo da ficha</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Os campos que cada equipe preenche na ficha de cada execução. Ano, projeto, ação, local, datas e números das
          inscrições vêm do sistema e não precisam estar aqui. Tirar um campo não apaga o que já foi preenchido.
        </p>
        {!pode ? <p className="text-sm text-muted-foreground">Só consulta: quem altera é a gestão da prestação de contas.</p> : null}
      </div>

      {EQUIPES.map((equipe) => {
        const lista = campos.filter((c) => c.ativo && c.equipe === equipe).sort((a, b) => a.ordem - b.ordem);
        return (
          <section key={equipe} className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold text-brand-deep">
                {EQUIPE_LABEL[equipe]} <span className="text-sm font-normal text-muted-foreground">· {lista.length} campos</span>
              </h2>
              {pode ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditando({ rotulo: "", ajuda: "", tipo: "TEXTO", opcoes: "", equipe, obrigatorio: false })}
                >
                  <Plus className="size-4" /> Campo
                </Button>
              ) : null}
            </div>
            <ul className="mt-2 divide-y divide-border/50">
              {lista.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-brand-deep">
                      {c.rotulo}
                      {c.obrigatorio ? <span className="text-red-600"> *</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {TIPO_CAMPO_LABEL[c.tipo]}
                      {c.tipo === "OPCOES" ? `: ${c.opcoes.join(", ")}` : ""}
                      {c.ajuda ? ` · ${c.ajuda}` : ""}
                    </div>
                  </div>
                  {pode ? (
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={pending || i === 0} onClick={() => acao(() => moverCampoAction(c.id, -1))}>
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Descer"
                        disabled={pending || i === lista.length - 1}
                        onClick={() => acao(() => moverCampoAction(c.id, 1))}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Editar"
                        onClick={() => setEditando({ ...c, opcoes: c.opcoes.join("\n") })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Tirar do modelo"
                        disabled={pending}
                        onClick={async () => {
                          const ok = await confirmar({
                            title: `Tirar "${c.rotulo}" da ficha?`,
                            description: "O campo deixa de aparecer nas fichas. O que já foi preenchido fica guardado, e dá para devolver depois.",
                            confirmLabel: "Tirar da ficha",
                            destructive: true,
                          });
                          if (ok) acao(() => setCampoAtivoAction(c.id, false), "Campo tirado da ficha");
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {removidos.length ? (
        <section className="space-y-2">
          <button type="button" className="text-sm font-medium text-teal-800 hover:underline" onClick={() => setVerRemovidos((v) => !v)}>
            {verRemovidos ? "Esconder" : "Ver"} {removidos.length} campo(s) tirado(s) da ficha
          </button>
          {verRemovidos ? (
            <ul className="divide-y divide-border/50 rounded-2xl border border-border/70 bg-white px-4 shadow-sm">
              {removidos.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <span className="text-muted-foreground line-through">{c.rotulo}</span>
                    <span className="text-xs text-muted-foreground"> · {EQUIPE_LABEL[c.equipe]}</span>
                  </span>
                  {pode ? (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => acao(() => setCampoAtivoAction(c.id, true), "Campo devolvido")}>
                      <RotateCcw className="size-4" /> Devolver
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {editando ? <CampoDialog inicial={editando} onClose={() => setEditando(null)} /> : null}
    </div>
  );
}

function CampoDialog({ inicial, onClose }: { inicial: Edicao; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [c, setC] = useState<Edicao>(inicial);
  const set = (p: Partial<Edicao>) => setC((x) => ({ ...x, ...p }));

  function salvar() {
    startTransition(async () => {
      const r = await salvarCampoAction({ ...c, opcoes: c.opcoes.split("\n") });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Campo salvo");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{c.id ? "Editar campo" : "Novo campo"}</DialogTitle>
          <DialogDescription>Aparece na ficha de todas as execuções.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do campo</Label>
            <Input value={c.rotulo} onChange={(e) => set({ rotulo: e.target.value })} autoFocus={!c.id} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <SimpleSelect
                value={c.tipo}
                onChange={(v) => set({ tipo: v as TipoCampoPrestacao })}
                className="h-9 w-full"
                aria-label="Tipo"
                options={(Object.keys(TIPO_CAMPO_LABEL) as TipoCampoPrestacao[]).map((t) => ({ value: t, label: TIPO_CAMPO_LABEL[t] }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quem preenche</Label>
              <SimpleSelect
                value={c.equipe}
                onChange={(v) => set({ equipe: v as EquipePrestacao })}
                className="h-9 w-full"
                aria-label="Quem preenche"
                options={EQUIPES.map((e) => ({ value: e, label: EQUIPE_LABEL[e] }))}
              />
            </div>
          </div>
          {c.tipo === "OPCOES" ? (
            <div className="space-y-1.5">
              <Label>Opções (uma por linha)</Label>
              <Textarea rows={4} value={c.opcoes} onChange={(e) => set({ opcoes: e.target.value })} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Explicação (opcional)</Label>
            <Input value={c.ajuda} onChange={(e) => set({ ajuda: e.target.value })} placeholder="Aparece embaixo do campo" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={c.obrigatorio} onChange={(e) => set({ obrigatorio: e.target.checked })} />
            Obrigatório (aparece primeiro nas pendências)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || !c.rotulo.trim()} onClick={salvar}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
