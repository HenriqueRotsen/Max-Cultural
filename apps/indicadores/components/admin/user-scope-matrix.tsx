"use client";

import type { DataScopeKind } from "@/lib/data-scope-shared";
import { cn } from "@/lib/utils";
import type { ScopeAccessLevel } from "@/lib/data-scope-shared";
import { scopeKey } from "@/lib/data-scope-shared";

export type HierarchyNode = {
  contextos: Array<{ id: string; nome: string }>;
  projetos: Array<{ id: string; nome: string; contextoId: string }>;
  oficinas: Array<{ id: string; nome: string; projetoId: string }>;
};

export type ScopeAccessMap = Record<string, ScopeAccessLevel>;

export const ACCESS_OPTIONS: Array<{
  value: ScopeAccessLevel;
  label: string;
  short: string;
}> = [
  { value: "none", label: "Sem acesso", short: "—" },
  { value: "viewer", label: "Visualizador", short: "Ver" },
  { value: "editor", label: "Editor", short: "Editar" },
];

export function emptyScopeMap(tree: HierarchyNode): ScopeAccessMap {
  const map: ScopeAccessMap = {};
  for (const c of tree.contextos) map[scopeKey("CONTEXTO", c.id)] = "none";
  for (const p of tree.projetos) map[scopeKey("PROJETO", p.id)] = "none";
  for (const o of tree.oficinas) map[scopeKey("OFICINA", o.id)] = "none";
  return map;
}

/** Hidrata mapa UI a partir dos scopes salvos (com herança). */
export function hydrateScopeMap(
  tree: HierarchyNode,
  scopes: Array<{
    kind: DataScopeKind;
    resourceId: string;
    access: "NONE" | "VIEWER" | "EDITOR";
  }>,
): ScopeAccessMap {
  const map = emptyScopeMap(tree);
  const explicit = new Map<string, ScopeAccessLevel>();
  for (const s of scopes) {
    const level =
      s.access === "EDITOR"
        ? "editor"
        : s.access === "VIEWER"
          ? "viewer"
          : "none";
    explicit.set(scopeKey(s.kind, s.resourceId), level);
  }

  for (const c of tree.contextos) {
    const key = scopeKey("CONTEXTO", c.id);
    map[key] = explicit.get(key) ?? "none";
  }
  for (const p of tree.projetos) {
    const key = scopeKey("PROJETO", p.id);
    const inherited = map[scopeKey("CONTEXTO", p.contextoId)] ?? "none";
    map[key] = explicit.has(key) ? explicit.get(key)! : inherited;
  }
  for (const o of tree.oficinas) {
    const key = scopeKey("OFICINA", o.id);
    const inherited = map[scopeKey("PROJETO", o.projetoId)] ?? "none";
    map[key] = explicit.has(key) ? explicit.get(key)! : inherited;
  }
  return map;
}

export function scopeMapToEntries(map: ScopeAccessMap) {
  return Object.entries(map).map(([key, access]) => {
    const [kind, resourceId] = key.split(":") as [DataScopeKind, string];
    return { kind, resourceId, access };
  });
}

function setAccessCascading(
  map: ScopeAccessMap,
  tree: HierarchyNode,
  kind: DataScopeKind,
  resourceId: string,
  access: ScopeAccessLevel,
): ScopeAccessMap {
  const next = { ...map };
  next[scopeKey(kind, resourceId)] = access;

  if (kind === "CONTEXTO") {
    for (const p of tree.projetos.filter((x) => x.contextoId === resourceId)) {
      next[scopeKey("PROJETO", p.id)] = access;
      for (const o of tree.oficinas.filter((x) => x.projetoId === p.id)) {
        next[scopeKey("OFICINA", o.id)] = access;
      }
    }
  }

  if (kind === "PROJETO") {
    for (const o of tree.oficinas.filter((x) => x.projetoId === resourceId)) {
      next[scopeKey("OFICINA", o.id)] = access;
    }
  }

  return next;
}

function AccessSelect({
  value,
  onChange,
  size = "md",
}: {
  value: ScopeAccessLevel;
  onChange: (v: ScopeAccessLevel) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-border bg-white/80 p-0.5",
        size === "sm" && "scale-95",
      )}
      role="group"
    >
      {ACCESS_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded px-1.5 py-1 text-[11px] font-medium transition-colors sm:px-2 sm:text-xs",
              active
                ? opt.value === "editor"
                  ? "bg-brand text-primary-foreground"
                  : opt.value === "viewer"
                    ? "bg-brand-soft text-brand-deep"
                    : "bg-muted text-muted-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.short}
          </button>
        );
      })}
    </div>
  );
}

type UserScopeMatrixProps = {
  tree: HierarchyNode;
  value: ScopeAccessMap;
  onChange: (next: ScopeAccessMap) => void;
};

export function UserScopeMatrix({
  tree,
  value,
  onChange,
}: UserScopeMatrixProps) {
  const focusContextoId =
    tree.contextos.find(
      (c) => (value[scopeKey("CONTEXTO", c.id)] ?? "none") !== "none",
    )?.id ?? tree.contextos[0]?.id;

  const visibleProjetos = tree.projetos.filter((p) => {
    // Mostra projetos de contextos com acesso ou todos se nenhum liberado
    const anyOpen = tree.contextos.some(
      (c) => (value[scopeKey("CONTEXTO", c.id)] ?? "none") !== "none",
    );
    if (!anyOpen) return true;
    return (value[scopeKey("CONTEXTO", p.contextoId)] ?? "none") !== "none";
  });

  const visibleOficinas = tree.oficinas.filter((o) => {
    const anyOpen = visibleProjetos.some(
      (p) => (value[scopeKey("PROJETO", p.id)] ?? "none") !== "none",
    );
    if (!anyOpen) {
      return visibleProjetos.some((p) => p.id === o.projetoId);
    }
    return (value[scopeKey("PROJETO", o.projetoId)] ?? "none") !== "none";
  });

  function setLevel(
    kind: DataScopeKind,
    resourceId: string,
    access: ScopeAccessLevel,
  ) {
    onChange(setAccessCascading(value, tree, kind, resourceId, access));
  }

  function setAll(
    kind: DataScopeKind,
    ids: string[],
    access: ScopeAccessLevel,
  ) {
    let next = value;
    for (const id of ids) {
      next = setAccessCascading(next, tree, kind, id, access);
    }
    onChange(next);
  }

  const allContextoIds = tree.contextos.map((c) => c.id);
  const allProjetoIds = visibleProjetos.map((p) => p.id);
  const allOficinaIds = visibleOficinas.map((o) => o.id);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Alterar um nível superior aplica o mesmo acesso a projetos e oficinas
        abaixo. Você pode ajustar item a item depois.
      </p>
      <div className="grid gap-3 lg:grid-cols-3">
        <ScopeColumn
          title="Contextos"
          count={tree.contextos.length}
          onBulk={(access) => setAll("CONTEXTO", allContextoIds, access)}
        >
          {tree.contextos.map((c) => {
            const level = value[scopeKey("CONTEXTO", c.id)] ?? "none";
            return (
              <ScopeRow
                key={c.id}
                label={c.nome || "(sem nome)"}
                hint={
                  focusContextoId === c.id && level !== "none"
                    ? "foco"
                    : undefined
                }
                level={level}
                onChange={(v) => setLevel("CONTEXTO", c.id, v)}
              />
            );
          })}
        </ScopeColumn>

        <ScopeColumn
          title="Projetos"
          count={visibleProjetos.length}
          onBulk={(access) => setAll("PROJETO", allProjetoIds, access)}
        >
          {visibleProjetos.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              Nenhum projeto neste filtro.
            </p>
          ) : (
            visibleProjetos.map((p) => {
              const ctx = tree.contextos.find((c) => c.id === p.contextoId);
              return (
                <ScopeRow
                  key={p.id}
                  label={p.nome}
                  hint={ctx?.nome}
                  level={value[scopeKey("PROJETO", p.id)] ?? "none"}
                  onChange={(v) => setLevel("PROJETO", p.id, v)}
                />
              );
            })
          )}
        </ScopeColumn>

        <ScopeColumn
          title="Oficinas"
          count={visibleOficinas.length}
          onBulk={(access) => setAll("OFICINA", allOficinaIds, access)}
        >
          {visibleOficinas.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              Nenhuma oficina neste filtro.
            </p>
          ) : (
            visibleOficinas.map((o) => {
              const proj = tree.projetos.find((p) => p.id === o.projetoId);
              return (
                <ScopeRow
                  key={o.id}
                  label={o.nome}
                  hint={proj?.nome}
                  level={value[scopeKey("OFICINA", o.id)] ?? "none"}
                  onChange={(v) => setLevel("OFICINA", o.id, v)}
                />
              );
            })
          )}
        </ScopeColumn>
      </div>
    </div>
  );
}

function ScopeColumn({
  title,
  count,
  onBulk,
  children,
}: {
  title: string;
  count: number;
  onBulk: (access: ScopeAccessLevel) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[16rem] flex-col rounded-xl border border-brand/15 bg-white/70">
      <div className="border-b border-brand/10 px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-brand-deep">{title}</h3>
          <span className="text-xs text-muted-foreground">{count}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <BulkBtn
            label="Ver todos"
            title="Definir todos como visualizador"
            onClick={() => onBulk("viewer")}
            tone="viewer"
          />
          <BulkBtn
            label="Editar todos"
            title="Definir todos como editor"
            onClick={() => onBulk("editor")}
            tone="editor"
          />
          <BulkBtn
            label="Remover todos"
            title="Remover acesso de todos"
            onClick={() => onBulk("none")}
            tone="none"
          />
        </div>
      </div>
      <div className="max-h-[22rem] flex-1 space-y-1 overflow-y-auto p-2">
        {children}
      </div>
    </div>
  );
}

function BulkBtn({
  label,
  title,
  onClick,
  tone,
}: {
  label: string;
  title: string;
  onClick: () => void;
  tone: ScopeAccessLevel;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        tone === "editor"
          ? "bg-brand/10 text-brand-deep hover:bg-brand/20"
          : tone === "viewer"
            ? "bg-brand-mist text-brand-deep hover:bg-brand-soft"
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ScopeRow({
  label,
  hint,
  level,
  onChange,
}: {
  label: string;
  hint?: string;
  level: ScopeAccessLevel;
  onChange: (v: ScopeAccessLevel) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-2 py-2 ring-1 ring-transparent",
        level !== "none" ? "bg-brand-mist/60 ring-brand/10" : "hover:bg-muted/40",
      )}
    >
      <div className="mb-1.5 min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        {hint ? (
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <AccessSelect value={level} onChange={onChange} size="sm" />
    </div>
  );
}
