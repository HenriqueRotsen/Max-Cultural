export type DataScopeKind = "CONTEXTO" | "PROJETO" | "OFICINA";
export type DataScopeAccess = "NONE" | "VIEWER" | "EDITOR";
export type ScopeAccessLevel = "none" | "viewer" | "editor";

export type ScopeEntry = {
  kind: DataScopeKind;
  resourceId: string;
  access: DataScopeAccess;
};

export function scopeKey(kind: DataScopeKind, resourceId: string) {
  return `${kind}:${resourceId}`;
}

export function accessToDb(
  level: ScopeAccessLevel,
): DataScopeAccess | null {
  if (level === "none") return "NONE";
  if (level === "viewer") return "VIEWER";
  if (level === "editor") return "EDITOR";
  return null;
}

export function accessFromDb(access: DataScopeAccess): ScopeAccessLevel {
  if (access === "EDITOR") return "editor";
  if (access === "VIEWER") return "viewer";
  return "none";
}

/**
 * Compacta o mapa da UI para persistência:
 * - grava VIEWER/EDITOR em contextos
 * - em projeto/oficina, só grava se divergir do ancestral imediato (incl. NONE)
 */
export function compactScopeEntries(input: {
  entries: Array<{
    kind: DataScopeKind;
    resourceId: string;
    access: ScopeAccessLevel;
  }>;
  projetos: Array<{ id: string; contextoId: string }>;
  oficinas: Array<{ id: string; projetoId: string }>;
}): ScopeEntry[] {
  const map = new Map<string, ScopeAccessLevel>();
  for (const e of input.entries) {
    map.set(scopeKey(e.kind, e.resourceId), e.access);
  }

  const projetoById = new Map(input.projetos.map((p) => [p.id, p]));
  const out: ScopeEntry[] = [];

  for (const e of input.entries) {
    if (e.kind === "CONTEXTO") {
      if (e.access === "none") continue;
      out.push({
        kind: "CONTEXTO",
        resourceId: e.resourceId,
        access: accessToDb(e.access)!,
      });
      continue;
    }

    let parent: ScopeAccessLevel = "none";
    if (e.kind === "PROJETO") {
      const p = projetoById.get(e.resourceId);
      parent = p
        ? (map.get(scopeKey("CONTEXTO", p.contextoId)) ?? "none")
        : "none";
    } else if (e.kind === "OFICINA") {
      const o = input.oficinas.find((x) => x.id === e.resourceId);
      parent = o
        ? (map.get(scopeKey("PROJETO", o.projetoId)) ?? "none")
        : "none";
    }

    if (e.access === parent) continue;
    out.push({
      kind: e.kind,
      resourceId: e.resourceId,
      access: accessToDb(e.access)!,
    });
  }

  return out;
}
