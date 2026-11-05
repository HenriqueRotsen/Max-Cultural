"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { useMunicipios } from "@/lib/municipios-client";

const UF_OPTIONS = (
  [
    ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"],
    ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"],
    ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"],
    ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
    ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"],
    ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
    ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"],
    ["SC", "Santa Catarina"], ["SP", "São Paulo"], ["SE", "Sergipe"],
    ["TO", "Tocantins"],
  ] as const
).map(([value, nome]) => ({ value, label: value, hint: nome }));

export type TerritorioRow = {
  key: string;
  nome: string;
  cidade: string;
  estado: string;
};

export type AcaoModalidadeValue = {
  ofereceOnline: boolean;
  oferecePresencial: boolean;
  territorios: TerritorioRow[];
};

export function emptyTerritorioRow(): TerritorioRow {
  return { key: crypto.randomUUID(), nome: "", cidade: "", estado: "" };
}

export function emptyAcaoModalidade(): AcaoModalidadeValue {
  return {
    ofereceOnline: false,
    oferecePresencial: true,
    territorios: [emptyTerritorioRow()],
  };
}

/** Payload de território para create/updateAcaoAction. */
export function territoriosPayload(v: AcaoModalidadeValue) {
  return v.oferecePresencial
    ? v.territorios.map((t, i) => ({
        nome: t.nome,
        cidade: t.cidade,
        estado: t.estado,
        ordem: i,
      }))
    : [];
}

/** Modalidade (online/presencial) e territórios presenciais (cidade/UF) da ação. */
export function AcaoModalidadeFields({
  value,
  onChange,
}: {
  value: AcaoModalidadeValue;
  onChange: (next: AcaoModalidadeValue) => void;
}) {
  const setRow = (idx: number, patch: Partial<TerritorioRow>) =>
    onChange({
      ...value,
      territorios: value.territorios.map((row, i) =>
        i === idx ? { ...row, ...patch } : row,
      ),
    });

  return (
    <>
      <div className="space-y-2">
        <Label>Modalidade</Label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.ofereceOnline}
              onCheckedChange={(v) =>
                onChange({ ...value, ofereceOnline: v === true })
              }
            />
            Online
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.oferecePresencial}
              onCheckedChange={(v) => {
                const on = v === true;
                onChange({
                  ...value,
                  oferecePresencial: on,
                  territorios:
                    on && value.territorios.length === 0
                      ? [emptyTerritorioRow()]
                      : value.territorios,
                });
              }}
            />
            Presencial
          </label>
        </div>
      </div>
      {value.oferecePresencial && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Territórios presenciais</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  territorios: [...value.territorios, emptyTerritorioRow()],
                })
              }
            >
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Onde a ação acontece: escolha a UF e depois a cidade. A zona ou
            bairro é opcional (ex.: Buritis, Belo Horizonte, MG); o mapa usa
            só a cidade e a UF.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {value.territorios.map((t, idx) => (
              <div
                key={t.key}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 rounded-md border p-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
              >
                <div className="space-y-1">
                  <Label className="text-xs">UF</Label>
                  <SearchSelect
                    value={t.estado}
                    options={UF_OPTIONS}
                    onValueChange={(estado) =>
                      // Trocar a UF limpa a cidade (ela é escolhida dentro da UF).
                      setRow(idx, estado === t.estado ? { estado } : { estado, cidade: "" })
                    }
                    placeholder="UF"
                    searchPlaceholder="Buscar estado…"
                    aria-label="UF"
                    showHintInTrigger={false}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cidade</Label>
                  <CidadeSelect uf={t.estado} value={t.cidade} onChange={(cidade) => setRow(idx, { cidade })} />
                </div>
                <div className="col-span-2 flex items-end gap-2 sm:col-span-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-xs">Zona ou bairro (opcional)</Label>
                    <Input
                      value={t.nome}
                      onChange={(e) => setRow(idx, { nome: e.target.value })}
                      placeholder="Ex.: Buritis, Zona Sul"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={value.territorios.length <= 1}
                    onClick={() =>
                      onChange({
                        ...value,
                        territorios: value.territorios.filter(
                          (_, i) => i !== idx,
                        ),
                      })
                    }
                    aria-label="Remover território"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Cidade escolhida entre os municípios da UF (IBGE), com pesquisa. */
function CidadeSelect({ uf, value, onChange }: { uf: string; value: string; onChange: (v: string) => void }) {
  const { cidades, carregando } = useMunicipios(uf);
  const options = cidades.map((c) => ({ value: c, label: c }));
  // Cidade gravada antes (fora da lista oficial) continua aparecendo para não sumir.
  if (value && !cidades.includes(value)) options.unshift({ value, label: value });
  return (
    <SearchSelect
      value={value}
      options={options}
      onValueChange={onChange}
      disabled={!uf}
      placeholder={!uf ? "Escolha a UF primeiro" : carregando ? "Carregando cidades…" : "Escolha a cidade"}
      searchPlaceholder="Buscar cidade…"
      emptyText="Nenhuma cidade encontrada."
      aria-label="Cidade"
    />
  );
}
