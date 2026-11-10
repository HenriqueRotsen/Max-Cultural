"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FORMULARIO_CAMPO_TIPOS,
  FORMULARIO_CAMPO_TIPO_LABELS,
  type FormularioCampoDraft,
  type FormularioCampoTipoCode,
} from "@/lib/formularios/types";
import { PERSON_COLUMNS } from "@/lib/column-map";
import { columnLabel } from "@/lib/column-labels";
import { cn } from "@/lib/utils";
import { OpcoesEditor } from "@/components/formularios/opcoes-editor";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import {
  ChevronDown,
  ChevronUp,
  Heading2,
  Info,
  Plus,
  Trash2,
} from "lucide-react";

const BUILDER_TIPOS = FORMULARIO_CAMPO_TIPOS.filter((t) => t !== "PARTICIPACAO");

const VINCULO_DISABLED_TIPOS = new Set([
  "SECTION",
  "INFO",
  "ADDRESS_BR",
  "DECLARACAO",
  "FILE_UPLOAD",
  "TERRITORIO_ACAO",
]);

const COLUNAS_VINCULAVEIS = PERSON_COLUMNS.filter(
  (c) =>
    !["Inscritos", "Selecionados", "Participantes", "Certificado"].includes(c),
);

/** Opções de "Coluna vinculada": nenhuma, a atual (se fora da lista) e as vinculáveis. */
function opcoesColuna(campo: FormularioCampoDraft): SearchSelectOption[] {
  const lista = COLUNAS_VINCULAVEIS as readonly string[];
  const extras = [
    campo.tipo === "TERRITORIO_ACAO" ? "Territorio" : null,
    campo.sigaColumn,
  ].filter((c, idx, arr): c is string => !!c && !lista.includes(c) && arr.indexOf(c) === idx);
  return [
    { value: "__none__", label: "Nenhuma (pergunta extra)" },
    ...[...extras, ...lista].map((col) => ({ value: col, label: columnLabel(col) })),
  ];
}

function newPergunta(): FormularioCampoDraft {
  return {
    ordem: 0,
    rotulo: "Nova pergunta",
    descricao: "",
    obrigatorio: false,
    tipo: "SHORT_TEXT",
    sigaColumn: null,
    opcoes: null,
    config: null,
  };
}

function newInfo(): FormularioCampoDraft {
  return {
    ordem: 0,
    rotulo: "Informação",
    descricao: "",
    obrigatorio: false,
    tipo: "INFO",
    sigaColumn: null,
    opcoes: null,
    config: null,
  };
}

function newSecao(): FormularioCampoDraft {
  return {
    ordem: 0,
    rotulo: "Nova seção",
    descricao: "",
    obrigatorio: false,
    tipo: "SECTION",
    sigaColumn: null,
    opcoes: null,
    config: null,
  };
}

type SectionGroup =
  | { kind: "orphan"; indices: number[] }
  | { kind: "section"; sectionIndex: number; questionIndices: number[] };

function groupBySection(campos: FormularioCampoDraft[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let orphan: number[] = [];
  let current: { sectionIndex: number; questionIndices: number[] } | null = null;

  for (let i = 0; i < campos.length; i++) {
    if (campos[i]!.tipo === "SECTION") {
      if (orphan.length) {
        groups.push({ kind: "orphan", indices: orphan });
        orphan = [];
      }
      if (current) groups.push({ kind: "section", ...current });
      current = { sectionIndex: i, questionIndices: [] };
    } else if (current) {
      current.questionIndices.push(i);
    } else {
      orphan.push(i);
    }
  }
  if (orphan.length) groups.push({ kind: "orphan", indices: orphan });
  if (current) groups.push({ kind: "section", ...current });
  return groups;
}

type Props = {
  campos: FormularioCampoDraft[];
  onChange: (campos: FormularioCampoDraft[]) => void;
};

type CtxMenu = {
  index: number;
  x: number;
  y: number;
};

export function CampoEditor({ campos, onChange }: Props) {
  const [menu, setMenu] = useState<CtxMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupBySection(campos), [campos]);

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    function onScroll() {
      setMenu(null);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);

  function renumber(list: FormularioCampoDraft[]) {
    return list.map((c, ordem) => ({ ...c, ordem }));
  }

  function update(i: number, patch: Partial<FormularioCampoDraft>) {
    const next = campos.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    onChange(renumber(next));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= campos.length) return;
    const next = [...campos];
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    onChange(renumber(next));
  }

  function remove(i: number) {
    onChange(renumber(campos.filter((_, idx) => idx !== i)));
  }

  function insertAt(index: number, item: FormularioCampoDraft) {
    const next = [...campos];
    next.splice(index, 0, item);
    onChange(renumber(next));
  }

  function openContextMenu(e: React.MouseEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const pad = 8;
    const menuW = 240;
    const menuH = 240;
    const x = Math.min(e.clientX, window.innerWidth - menuW - pad);
    const y = Math.min(e.clientY, window.innerHeight - menuH - pad);
    setMenu({ index, x: Math.max(pad, x), y: Math.max(pad, y) });
  }

  function renderCampo(i: number, opts?: { nested?: boolean; secaoTitulo?: string }) {
    const campo = campos[i]!;
    const isSection = campo.tipo === "SECTION";
    const isInfo = campo.tipo === "INFO";
    const nested = Boolean(opts?.nested);

    return (
      <div
        key={`${campo.id ?? "new"}-${i}`}
        onContextMenu={(e) => openContextMenu(e, i)}
        className={cn(
          "rounded-lg border bg-card p-4 space-y-3",
          isSection
            ? "border-brand-deep/35 bg-white"
            : isInfo
              ? "border-sky-200 bg-sky-50/60"
              : nested
              ? "border-border/70 bg-white shadow-sm"
              : "border-border/80",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">#{i + 1}</span>
            {isSection ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-brand-deep/10 px-2 py-0.5 text-xs font-medium text-brand-deep">
                <Heading2 className="size-3.5" />
                Seção
              </span>
            ) : (
              <>
                {isInfo ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                    <Info className="size-3.5" />
                    Texto informativo
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Pergunta</span>
                )}
                {opts?.secaoTitulo ? (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    em: {opts.secaoTitulo}
                  </span>
                ) : (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                    fora de seção
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex gap-1">
            <Button type="button" size="icon" variant="ghost" onClick={() => move(i, -1)}>
              <ChevronUp className="size-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => move(i, 1)}>
              <ChevronDown className="size-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>{isSection ? "Título da seção" : isInfo ? "Título" : "Rótulo"}</Label>
            <Input
              value={campo.rotulo}
              onChange={(e) => update(i, { rotulo: e.target.value })}
            />
          </div>

              {!isSection ? (
                <>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <SearchSelect
                      className="w-full"
                      aria-label="Tipo"
                      value={campo.tipo}
                      onValueChange={(v) => {
                        if (!v) return;
                        update(i, {
                          tipo: v as FormularioCampoTipoCode,
                          ...(v === "SECTION" || v === "INFO"
                            ? { obrigatorio: false, sigaColumn: null }
                            : {}),
                          ...(v === "TERRITORIO_ACAO"
                            ? { sigaColumn: "Territorio", obrigatorio: true }
                            : {}),
                        });
                      }}
                      options={BUILDER_TIPOS.map((t) => ({
                        value: t,
                        label: FORMULARIO_CAMPO_TIPO_LABELS[t],
                      }))}
                    />
                  </div>
                  {!isInfo ? (
                  <div className="space-y-1">
                    <Label>Coluna vinculada</Label>
                    <SearchSelect
                      className="w-full"
                      aria-label="Coluna vinculada"
                      value={
                        campo.tipo === "TERRITORIO_ACAO"
                          ? "Territorio"
                          : (campo.sigaColumn ?? "__none__")
                      }
                      onValueChange={(v) =>
                        update(i, {
                          sigaColumn:
                            !v || v === "__none__" ? null : v.trim(),
                        })
                      }
                      disabled={VINCULO_DISABLED_TIPOS.has(campo.tipo)}
                      placeholder="Nenhuma (pergunta extra)"
                      options={opcoesColuna(campo)}
                    />
                  </div>
                  ) : null}
                </>
              ) : null}

          <div className="space-y-1 sm:col-span-2">
            <Label>
              {isSection ? "Texto da seção" : isInfo ? "Texto" : "Ajuda / descrição"}
            </Label>
            <Textarea
              rows={isSection || isInfo ? 4 : 2}
              value={campo.descricao}
              onChange={(e) => update(i, { descricao: e.target.value })}
              placeholder={
                isSection || isInfo
                  ? "Ementa, programação, critérios, avisos…"
                  : undefined
              }
            />
          </div>

          {campo.tipo === "TERRITORIO_ACAO" && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              No formulário público a pessoa escolhe Online e/ou Presencial (conforme
              a ação) e, se presencial, informa cidade, território/comunidade e
              UF. Preenche automaticamente as colunas SIGA Cidade, Estado e
              Territorio.
            </p>
          )}

          {(campo.tipo === "MULTIPLE_CHOICE" ||
            campo.tipo === "CHECKBOXES" ||
            campo.tipo === "DROPDOWN") && (
            <OpcoesEditor
              label={
                campo.tipo === "DROPDOWN"
                  ? "Itens da lista"
                  : campo.tipo === "CHECKBOXES"
                    ? "Opções (múltipla seleção)"
                    : "Opções (escolha única)"
              }
              hint="Enter adiciona a próxima opção. Use as setas para reordenar."
              placeholder="Ex.: Instagram"
              opcoes={campo.opcoes?.length ? campo.opcoes : [""]}
              onChange={(opcoes) => update(i, { opcoes })}
            />
          )}

          {campo.tipo === "FILE_UPLOAD" && (
            <OpcoesEditor
              label="Formatos aceitos"
              hint="Extensões permitidas (ex.: pdf, jpg, png). Deixe vazio para aceitar qualquer arquivo."
              placeholder="Ex.: pdf"
              opcoes={campo.opcoes?.length ? campo.opcoes : [""]}
              onChange={(opcoes) => update(i, { opcoes })}
            />
          )}

          {campo.tipo === "DECLARACAO" && (
            <div className="space-y-1 sm:col-span-2">
              <Label>Texto do checkbox</Label>
              <Input
                value={String(
                  campo.config?.checkboxLabel ??
                    "Declaro o cumprimento deste requisito.",
                )}
                onChange={(e) =>
                  update(i, {
                    config: {
                      ...(campo.config ?? {}),
                      checkboxLabel: e.target.value,
                    },
                  })
                }
              />
            </div>
          )}

          {isInfo ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Aparece no formulário como um bloco de leitura, sem resposta. Quebras
              de linha são mantidas.
            </p>
          ) : null}

          {!isSection && !isInfo ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={campo.obrigatorio}
                  onChange={(e) => update(i, { obrigatorio: e.target.checked })}
                />
                Obrigatório
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(campo.config?.ocultoProfessor)}
                  onChange={(e) =>
                    update(i, {
                      config: {
                        ...(campo.config ?? {}),
                        ocultoProfessor: e.target.checked,
                      },
                    })
                  }
                />
                Ocultar coluna para o professor
              </label>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group, gi) => {
        if (group.kind === "orphan") {
          return (
            <div
              key={`orphan-${gi}`}
              className="space-y-3 rounded-xl border border-dashed border-amber-300/80 bg-amber-50/40 p-3"
            >
              <div className="px-1">
                <p className="text-sm font-medium text-amber-900">
                  Perguntas sem seção
                </p>
                <p className="text-xs text-amber-800/80">
                  Estas perguntas ficam antes da primeira seção. Adicione uma
                  seção acima ou mova-as para dentro de uma.
                </p>
              </div>
              <div className="space-y-3">
                {group.indices.map((i) => renderCampo(i))}
              </div>
            </div>
          );
        }

        const secao = campos[group.sectionIndex]!;
        const titulo = secao.rotulo.trim() || "Seção sem título";
        const qCount = group.questionIndices.length;

        return (
          <div
            key={`section-${group.sectionIndex}`}
            onContextMenu={(e) => openContextMenu(e, group.sectionIndex)}
            className="rounded-xl border border-brand-deep/25 bg-brand-deep/[0.04]"
          >
            <div className="rounded-t-xl border-b border-brand-deep/15 bg-brand-deep/[0.06] px-3 py-2">
              <p className="text-sm font-semibold text-brand-deep">
                Seção: {titulo}
              </p>
              <p className="text-xs text-muted-foreground">
                {qCount === 0
                  ? "Nenhuma pergunta nesta seção ainda — botão direito para inserir"
                  : `${qCount} pergunta${qCount === 1 ? "" : "s"} nesta seção`}
              </p>
            </div>

            <div className="space-y-3 p-3">
              {renderCampo(group.sectionIndex)}

              <div
                className="ml-0 space-y-3 border-l-2 border-brand-deep/25 pl-3 sm:ml-2 sm:pl-4"
                onContextMenu={(e) => openContextMenu(e, group.sectionIndex)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-deep/80">
                    Perguntas desta seção
                  </p>
                  <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      insertAt(
                        group.sectionIndex + group.questionIndices.length + 1,
                        newPergunta(),
                      )
                    }
                  >
                    <Plus className="mr-1 size-3.5" />
                    Pergunta nesta seção
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      insertAt(
                        group.sectionIndex + group.questionIndices.length + 1,
                        newInfo(),
                      )
                    }
                  >
                    <Info className="mr-1 size-3.5" />
                    Texto nesta seção
                  </Button>
                  </div>
                </div>

                {qCount === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/80 bg-white/70 px-3 py-4 text-sm text-muted-foreground">
                    Use o botão acima ou o botão direito nesta seção para incluir
                    perguntas.
                  </p>
                ) : (
                  group.questionIndices.map((i) =>
                    renderCampo(i, { nested: true, secaoTitulo: titulo }),
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => insertAt(campos.length, newPergunta())}>
          <Plus className="mr-1 size-4" />
          Adicionar pergunta
        </Button>
        <Button type="button" variant="outline" onClick={() => insertAt(campos.length, newSecao())}>
          <Heading2 className="mr-1 size-4" />
          Adicionar seção
        </Button>
        <Button type="button" variant="outline" onClick={() => insertAt(campos.length, newInfo())}>
          <Info className="mr-1 size-4" />
          Adicionar texto informativo
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Clique com o botão direito em qualquer bloco para inserir pergunta,
        seção ou texto informativo acima/abaixo.
      </p>

      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[300] min-w-[220px] rounded-lg border border-border bg-popover p-1 text-sm shadow-md"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              insertAt(menu.index, newPergunta());
              setMenu(null);
            }}
          >
            Adicionar pergunta acima
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              insertAt(menu.index + 1, newPergunta());
              setMenu(null);
            }}
          >
            Adicionar pergunta abaixo
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              insertAt(menu.index, newSecao());
              setMenu(null);
            }}
          >
            Adicionar seção acima
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              insertAt(menu.index + 1, newSecao());
              setMenu(null);
            }}
          >
            Adicionar seção abaixo
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              insertAt(menu.index, newInfo());
              setMenu(null);
            }}
          >
            Adicionar texto informativo acima
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              insertAt(menu.index + 1, newInfo());
              setMenu(null);
            }}
          >
            Adicionar texto informativo abaixo
          </button>
        </div>
      ) : null}
    </div>
  );
}
