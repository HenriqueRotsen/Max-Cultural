export type HierarchyLockLevel =
  | "FONTE"
  | "PRODUCT"
  | "STAGE"
  | "CITY"
  | "ITEM";

export type HierarchyLockPath = {
  fonteRecurso?: string;
  productName?: string;
  stageName?: string;
  state?: string;
  city?: string;
  budgetLineId?: string | null;
};

export type HierarchyLockRecord = HierarchyLockPath & {
  id?: string;
  sheetId?: string;
  level: HierarchyLockLevel;
  scopeKey: string;
};

export type LockableLine = {
  id: string;
  fonteRecurso: string;
  productName: string;
  stageName: string;
  state: string;
  city: string;
};

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

/** Chave estável por nível + caminho (única por sheet). */
export function buildLockScopeKey(
  level: HierarchyLockLevel,
  path: HierarchyLockPath,
): string {
  const fonte = norm(path.fonteRecurso);
  const product = norm(path.productName);
  const stage = norm(path.stageName);
  const state = norm(path.state);
  const city = norm(path.city);
  const lineId = norm(path.budgetLineId);

  switch (level) {
    case "FONTE":
      return `FONTE|${fonte}`;
    case "PRODUCT":
      return `PRODUCT|${fonte}|${product}`;
    case "STAGE":
      return `STAGE|${fonte}|${product}|${stage}`;
    case "CITY":
      return `CITY|${fonte}|${product}|${stage}|${state}|${city}`;
    case "ITEM":
      return `ITEM|${lineId}`;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export function normalizeLockPath(
  level: HierarchyLockLevel,
  path: HierarchyLockPath,
): Required<
  Pick<
    HierarchyLockPath,
    "fonteRecurso" | "productName" | "stageName" | "state" | "city"
  >
> & { budgetLineId: string | null } {
  const base = {
    fonteRecurso: "",
    productName: "",
    stageName: "",
    state: "",
    city: "",
    budgetLineId: null as string | null,
  };
  if (level === "ITEM") {
    return { ...base, budgetLineId: norm(path.budgetLineId) || null };
  }
  base.fonteRecurso = norm(path.fonteRecurso);
  if (level === "FONTE") return base;
  base.productName = norm(path.productName);
  if (level === "PRODUCT") return base;
  base.stageName = norm(path.stageName);
  if (level === "STAGE") return base;
  base.state = norm(path.state);
  base.city = norm(path.city);
  return base;
}

/** O lock cobre a linha (próprio nível ou ancestral). */
export function lockMatchesLine(
  lock: HierarchyLockRecord,
  line: LockableLine,
): boolean {
  switch (lock.level) {
    case "FONTE":
      return norm(lock.fonteRecurso) === norm(line.fonteRecurso);
    case "PRODUCT":
      return (
        norm(lock.fonteRecurso) === norm(line.fonteRecurso) &&
        norm(lock.productName) === norm(line.productName)
      );
    case "STAGE":
      return (
        norm(lock.fonteRecurso) === norm(line.fonteRecurso) &&
        norm(lock.productName) === norm(line.productName) &&
        norm(lock.stageName) === norm(line.stageName)
      );
    case "CITY":
      return (
        norm(lock.fonteRecurso) === norm(line.fonteRecurso) &&
        norm(lock.productName) === norm(line.productName) &&
        norm(lock.stageName) === norm(line.stageName) &&
        norm(lock.state) === norm(line.state) &&
        norm(lock.city) === norm(line.city)
      );
    case "ITEM":
      return norm(lock.budgetLineId) === norm(line.id);
    default:
      return false;
  }
}

export function isLineLocked(
  line: LockableLine,
  locks: HierarchyLockRecord[],
): boolean {
  return locks.some((lock) => lockMatchesLine(lock, line));
}

export function lockedLineIds(
  lines: LockableLine[],
  locks: HierarchyLockRecord[],
): Set<string> {
  const out = new Set<string>();
  for (const line of lines) {
    if (isLineLocked(line, locks)) out.add(line.id);
  }
  return out;
}

/** Há cadeado exatamente neste escopo (não herança). */
export function hasExactLock(
  locks: HierarchyLockRecord[],
  level: HierarchyLockLevel,
  path: HierarchyLockPath,
): boolean {
  const key = buildLockScopeKey(level, normalizeLockPath(level, path));
  return locks.some((l) => l.scopeKey === key || (
    l.level === level && buildLockScopeKey(l.level, l) === key
  ));
}

/** Nó efetivamente bloqueado (cadeado próprio ou ancestral). */
export function isNodeEffectivelyLocked(
  locks: HierarchyLockRecord[],
  level: HierarchyLockLevel,
  path: HierarchyLockPath,
  sampleLine: LockableLine | null,
): boolean {
  if (hasExactLock(locks, level, path)) return true;
  if (!sampleLine) return false;
  return isLineLocked(sampleLine, locks);
}

export function findLockForScope(
  locks: HierarchyLockRecord[],
  level: HierarchyLockLevel,
  path: HierarchyLockPath,
): HierarchyLockRecord | undefined {
  const key = buildLockScopeKey(level, normalizeLockPath(level, path));
  return locks.find((l) => l.scopeKey === key);
}

/** True se a linha está bloqueada e o aprovado mudou (redistribuição/readequação). */
export function isForbiddenApprovedChange(
  lineId: string,
  currentApproved: number,
  nextApproved: number,
  lockedIds: Set<string>,
): boolean {
  if (!lockedIds.has(lineId)) return false;
  return Math.abs(nextApproved - currentApproved) > 0.005;
}

export type ToggleLockInput = {
  level: HierarchyLockLevel;
  path: HierarchyLockPath;
};

/** Valida path mínimo e que existe linha coberta no sheet. */
export function validateLockPathAgainstLines(
  level: HierarchyLockLevel,
  path: HierarchyLockPath,
  lines: LockableLine[],
): { ok: true; normalized: ReturnType<typeof normalizeLockPath>; scopeKey: string } | { ok: false; error: string } {
  const normalized = normalizeLockPath(level, path);
  if (level === "ITEM") {
    if (!normalized.budgetLineId) {
      return { ok: false, error: "Informe a linha (item) a bloquear." };
    }
    if (!lines.some((l) => l.id === normalized.budgetLineId)) {
      return { ok: false, error: "Item não encontrado na planilha." };
    }
  } else if (!normalized.fonteRecurso) {
    return { ok: false, error: "Informe a fonte de recurso." };
  } else if (level !== "FONTE" && !normalized.productName) {
    return { ok: false, error: "Informe o produto." };
  } else if (
    (level === "STAGE" || level === "CITY") &&
    !normalized.stageName
  ) {
    return { ok: false, error: "Informe a etapa." };
  }

  const scopeKey = buildLockScopeKey(level, normalized);
  const probe: LockableLine =
    level === "ITEM"
      ? lines.find((l) => l.id === normalized.budgetLineId)!
      : {
          id: "",
          fonteRecurso: normalized.fonteRecurso,
          productName: normalized.productName || lines[0]?.productName || "",
          stageName: normalized.stageName || lines[0]?.stageName || "",
          state: normalized.state,
          city: normalized.city,
        };

  const covers = lines.some((l) =>
    lockMatchesLine(
      { level, scopeKey, ...normalized },
      l,
    ),
  );
  if (!covers && level !== "ITEM") {
    // STAGE/CITY/PRODUCT/FONTE must match at least one line
    const any = lines.some((l) => {
      if (norm(l.fonteRecurso) !== normalized.fonteRecurso) return false;
      if (level === "FONTE") return true;
      if (norm(l.productName) !== normalized.productName) return false;
      if (level === "PRODUCT") return true;
      if (norm(l.stageName) !== normalized.stageName) return false;
      if (level === "STAGE") return true;
      return (
        norm(l.state) === normalized.state &&
        norm(l.city) === normalized.city
      );
    });
    if (!any) {
      return { ok: false, error: "Escopo não encontrado na planilha." };
    }
  }
  void probe;
  return { ok: true, normalized, scopeKey };
}
