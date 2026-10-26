"use client";

import { MapPin } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  TerritorioImportState,
  TerritorioValorPlanilha,
} from "@/lib/import-territorio";

function OpcaoSelect({
  value,
  opcoes,
  placeholder,
  onChange,
}: {
  value: string;
  opcoes: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => onChange(v ?? "")}
      items={Object.fromEntries(opcoes.map((o) => [o, o]))}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Onde a oficina aconteceu para cada inscrição do lote (só opções da oficina). */
export function ImportTerritorioCard({
  opcoes,
  values,
  blankCount,
  state,
  onChange,
  pendencia,
}: {
  opcoes: string[];
  values: TerritorioValorPlanilha[];
  blankCount: number;
  state: TerritorioImportState;
  onChange: (next: TerritorioImportState) => void;
  pendencia: string | null;
}) {
  const temColuna = values.length > 0;
  const unica = opcoes.length === 1;

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border px-4 py-3",
        pendencia ? "border-amber-300 bg-amber-50/80" : "border-brand/20 bg-[var(--navy-soft)]",
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-brand-deep">
        <MapPin className="size-4 text-brand" />
        Território da oficina
      </div>

      {opcoes.length === 0 ? (
        <p className="text-sm text-amber-900">{pendencia}</p>
      ) : unica ? (
        <p className="text-sm text-muted-foreground">
          A oficina acontece só em{" "}
          <span className="font-medium text-brand-deep">{opcoes[0]}</span> — todas as
          inscrições do lote ficam neste território.
        </p>
      ) : (
        <>
          {temColuna ? (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={state.modo === "planilha"}
                  onChange={() => onChange({ ...state, modo: "planilha" })}
                />
                Usar a coluna da planilha
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={state.modo === "lote"}
                  onChange={() => onChange({ ...state, modo: "lote" })}
                />
                Mesmo território para todo o lote
              </label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              A planilha não tem coluna de território. Escolha onde a oficina aconteceu
              para estas inscrições.
            </p>
          )}

          {state.modo === "planilha" && temColuna ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Ligue cada valor da planilha a um território cadastrado na oficina. A
                ligação fica salva para as próximas importações.
              </p>
              <div className="grid gap-2">
                {values.map((v) => (
                  <div
                    key={v.raw}
                    className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]"
                  >
                    <div className="truncate text-sm">
                      <span className="font-mono text-xs">{v.raw}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {v.count} linha(s)
                      </span>
                    </div>
                    <OpcaoSelect
                      value={state.mapa[v.raw] ?? ""}
                      opcoes={opcoes}
                      placeholder="Escolha o território…"
                      onChange={(label) =>
                        onChange({ ...state, mapa: { ...state.mapa, [v.raw]: label } })
                      }
                    />
                  </div>
                ))}
              </div>
              {blankCount > 0 ? (
                <div className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
                  <div className="text-sm text-muted-foreground">
                    Sem território na planilha ({blankCount} linha(s))
                  </div>
                  <OpcaoSelect
                    value={state.lote}
                    opcoes={opcoes}
                    placeholder="Escolha o território…"
                    onChange={(lote) => onChange({ ...state, lote })}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="max-w-md space-y-1">
              <Label className="text-xs">Território de todas as inscrições</Label>
              <OpcaoSelect
                value={state.lote}
                opcoes={opcoes}
                placeholder="Escolha o território…"
                onChange={(lote) => onChange({ ...state, lote })}
              />
            </div>
          )}
          {pendencia ? <p className="text-xs text-amber-900">{pendencia}</p> : null}
        </>
      )}
    </div>
  );
}
