"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  listContextosSelectAction,
  moveProjetoContextoAction,
} from "@/app/actions/contextos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  projetoId: string;
  contextoId: string;
  contextoNome: string;
  compact?: boolean;
};

export function ProjetoContextEditor({
  projetoId,
  contextoId,
  contextoNome,
  compact = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(contextoId);
  const [contextos, setContextos] = useState<
    Array<{ id: string; nome: string }>
  >([]);

  useEffect(() => {
    setSelectedId(contextoId);
  }, [contextoId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listContextosSelectAction({ q, editableOnly: true }).then((rows) => {
        if (!cancelled) setContextos(rows);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, q]);

  const options = useMemo(() => {
    const map = new Map(contextos.map((c) => [c.id, c.nome]));
    if (!map.has(contextoId)) map.set(contextoId, contextoNome);
    return [...map.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [contextos, contextoId, contextoNome]);

  function save() {
    if (!selectedId || selectedId === contextoId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const r = await moveProjetoContextoAction(projetoId, selectedId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Projeto movido para "${r.contextoNome}"`);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className={compact ? "text-sm" : "mt-2"}>
        <span className="text-muted-foreground">Contexto: </span>
        <span className="font-medium text-brand-deep">{contextoNome}</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="ml-1 h-auto p-0 text-brand"
          onClick={() => setOpen(true)}
        >
          Alterar
        </Button>
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "space-y-2 rounded-xl border border-brand/15 bg-brand-soft/30 p-3"
          : "mt-3 space-y-3 rounded-xl border border-brand/15 bg-brand-soft/30 p-4"
      }
    >
      <Label htmlFor={`ctx-move-${projetoId}`}>Mover para contexto</Label>
      <Input
        id={`ctx-move-${projetoId}`}
        value={q}
        placeholder="Buscar contexto…"
        onChange={(e) => setQ(e.target.value)}
      />
      <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? "")}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecione o contexto" />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome || "(sem nome)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={save}>
          {pending ? "Salvando…" : "Salvar contexto"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setSelectedId(contextoId);
            setQ("");
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
