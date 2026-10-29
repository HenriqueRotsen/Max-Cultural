"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

type Props = {
  label?: string;
  hint?: string;
  placeholder?: string;
  opcoes: string[];
  onChange: (opcoes: string[]) => void;
};

export function OpcoesEditor({
  label = "Opções",
  hint,
  placeholder = "Texto da opção",
  opcoes,
  onChange,
}: Props) {
  const rows = opcoes.length > 0 ? opcoes : [""];

  function setRow(i: number, value: string) {
    const next = [...rows];
    next[i] = value;
    onChange(next);
  }

  function addRow(after?: number) {
    const next = [...rows];
    const at = after == null ? next.length : after + 1;
    next.splice(at, 0, "");
    onChange(next);
  }

  function removeRow(i: number) {
    if (rows.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(rows.filter((_, idx) => idx !== i));
  }

  function moveRow(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    onChange(next);
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Label>{label}</Label>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => addRow()}>
          <Plus className="mr-1 size-3.5" />
          Adicionar opção
        </Button>
      </div>

      <ul className="space-y-2">
        {rows.map((opt, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
              {i + 1}.
            </span>
            <Input
              value={opt}
              placeholder={placeholder}
              onChange={(e) => setRow(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRow(i);
                }
              }}
              className="flex-1"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => moveRow(i, -1)}
              disabled={i === 0}
              aria-label="Mover para cima"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => moveRow(i, 1)}
              disabled={i === rows.length - 1}
              aria-label="Mover para baixo"
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => removeRow(i)}
              aria-label="Remover opção"
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Normaliza lista de opções (remove vazias, trim). */
export function normalizeOpcoes(opcoes: string[] | null | undefined): string[] {
  if (!opcoes?.length) return [];
  return opcoes.map((s) => s.trim()).filter(Boolean);
}
