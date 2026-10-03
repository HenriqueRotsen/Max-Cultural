import type { Prisma } from "@/generated/prisma/client";

export const LOGS_PAGE_SIZE_DEFAULT = 50;
export const LOGS_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export type LogsSortKey =
  | "createdAt"
  | "actor"
  | "action"
  | "screen"
  | "entity"
  | "ip";

export type LogsQuery = {
  /** Texto residual usado no WHERE (após detecção inteligente). */
  q: string;
  /** Valor exibido no campo de busca (entrada original). */
  qInput: string;
  action: string;
  screen: string;
  actorId: string;
  entityType: string;
  from: string;
  to: string;
  sort: LogsSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  /** Dicas detectadas automaticamente a partir da busca livre. */
  smartHints: string[];
};

const SORT_KEYS = new Set<LogsSortKey>([
  "createdAt",
  "actor",
  "action",
  "screen",
  "entity",
  "ip",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const IPV4_RE =
  /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]{2,39}$/i;
const DATE_BR_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DATE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ACTION_CODE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;
const ACTION_PREFIX_RE =
  /^(auth|iam|planning|origem|fluxo|cultural|inscricao|contexto|projeto|oficina|user|role|audit|import|consulta)\.?$/i;

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function parseDateToken(token: string): string | null {
  const br = token.match(DATE_BR_RE);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (DATE_ISO_RE.test(token)) return token;
  return null;
}

function clampPageSize(n: number) {
  if ((LOGS_PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) return n;
  return LOGS_PAGE_SIZE_DEFAULT;
}

/** Interpreta searchParams da página /logs. */
export function parseLogsQuery(
  sp: Record<string, string | string[] | undefined>,
): LogsQuery {
  const rawQ = (first(sp.q) || "").trim();
  let action = (first(sp.action) || "").trim();
  let screen = (first(sp.screen) || "").trim();
  let actorId = (first(sp.actor) || "").trim();
  let entityType = (first(sp.entityType) || "").trim();
  let from = (first(sp.from) || "").trim();
  let to = (first(sp.to) || "").trim();
  const sortRaw = (first(sp.sort) || "createdAt").trim() as LogsSortKey;
  const sort = SORT_KEYS.has(sortRaw) ? sortRaw : "createdAt";
  const dir = (first(sp.dir) || "desc").trim() === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(first(sp.page) || "1") || 1);
  const pageSize = clampPageSize(
    Number(first(sp.pageSize) || String(LOGS_PAGE_SIZE_DEFAULT)) ||
      LOGS_PAGE_SIZE_DEFAULT,
  );

  const smartHints: string[] = [];
  let q = rawQ;

  if (rawQ) {
    const date = parseDateToken(rawQ);
    if (date) {
      // Busca que é só uma data vira filtro de período (não OR textual).
      if (!from) from = date;
      if (!to) to = date;
      q = "";
      smartHints.push(`Data ${date.split("-").reverse().join("/")}`);
    } else if (EMAIL_RE.test(rawQ)) {
      smartHints.push("E-mail do usuário");
    } else if (IPV4_RE.test(rawQ)) {
      smartHints.push("Endereço IP");
    } else if (ACTION_CODE_RE.test(rawQ)) {
      if (!action) action = rawQ;
      q = "";
      smartHints.push(`Ação ${action || rawQ}`);
    } else if (ACTION_PREFIX_RE.test(rawQ.replace(/\.$/, ""))) {
      const prefix = rawQ.replace(/\.$/, "");
      if (!action) {
        action = prefix.includes(".") ? prefix : `${prefix}.`;
      }
      q = "";
      smartHints.push(`Categoria ${prefix}`);
    }
  }

  return {
    q,
    qInput: rawQ,
    action,
    screen,
    actorId,
    entityType,
    from,
    to,
    sort,
    dir,
    page,
    pageSize,
    smartHints,
  };
}

export function buildAuditLogWhere(
  query: LogsQuery,
): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];

  if (query.action) {
    and.push({
      action: query.action.endsWith(".")
        ? { startsWith: query.action, mode: "insensitive" }
        : { contains: query.action, mode: "insensitive" },
    });
  }
  if (query.screen) {
    and.push({ screen: { contains: query.screen, mode: "insensitive" } });
  }
  if (query.actorId) {
    and.push({ actorUserId: query.actorId });
  }
  if (query.entityType) {
    and.push({
      entityType: { contains: query.entityType, mode: "insensitive" },
    });
  }
  if (query.from || query.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(`${query.from}T00:00:00`);
    if (query.to) createdAt.lte = new Date(`${query.to}T23:59:59.999`);
    and.push({ createdAt });
  }

  if (query.q) {
    const term = query.q;
    const or: Prisma.AuditLogWhereInput[] = [
      { action: { contains: term, mode: "insensitive" } },
      { screen: { contains: term, mode: "insensitive" } },
      { entityType: { contains: term, mode: "insensitive" } },
      { entityId: { contains: term, mode: "insensitive" } },
      { ip: { contains: term, mode: "insensitive" } },
      { actor: { email: { contains: term, mode: "insensitive" } } },
      { actor: { name: { contains: term, mode: "insensitive" } } },
    ];
    and.push({ OR: or });
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0]!;
  return { AND: and };
}

export function buildAuditLogOrderBy(
  query: LogsQuery,
): Prisma.AuditLogOrderByWithRelationInput[] {
  const dir = query.dir;
  switch (query.sort) {
    case "actor":
      return [{ actor: { name: dir } }, { createdAt: "desc" }];
    case "action":
      return [{ action: dir }, { createdAt: "desc" }];
    case "screen":
      return [{ screen: dir }, { createdAt: "desc" }];
    case "entity":
      return [{ entityType: dir }, { entityId: dir }, { createdAt: "desc" }];
    case "ip":
      return [{ ip: dir }, { createdAt: "desc" }];
    case "createdAt":
    default:
      return [{ createdAt: dir }];
  }
}

/** Serializa filtros atuais (sem page) para links/export. */
export function logsQueryToSearchParams(
  query: Pick<
    LogsQuery,
    | "q"
    | "qInput"
    | "action"
    | "screen"
    | "actorId"
    | "entityType"
    | "from"
    | "to"
    | "sort"
    | "dir"
    | "page"
    | "pageSize"
  >,
  overrides: Partial<{ page: number; sort: LogsSortKey; dir: "asc" | "desc" }> = {},
): URLSearchParams {
  const qs = new URLSearchParams();
  const page = overrides.page ?? query.page;
  const sort = overrides.sort ?? query.sort;
  const dir = overrides.dir ?? query.dir;
  const qOut = query.qInput || query.q;
  if (qOut) qs.set("q", qOut);
  if (query.action) qs.set("action", query.action);
  if (query.screen) qs.set("screen", query.screen);
  if (query.actorId) qs.set("actor", query.actorId);
  if (query.entityType) qs.set("entityType", query.entityType);
  if (query.from) qs.set("from", query.from);
  if (query.to) qs.set("to", query.to);
  if (sort !== "createdAt") qs.set("sort", sort);
  if (dir !== "desc") qs.set("dir", dir);
  if (page > 1) qs.set("page", String(page));
  if (query.pageSize !== LOGS_PAGE_SIZE_DEFAULT) {
    qs.set("pageSize", String(query.pageSize));
  }
  return qs;
}

export type LogRowDTO = {
  id: string;
  createdAt: string;
  action: string;
  screen: string;
  entityType: string;
  entityId: string;
  ip: string | null;
  meta: unknown;
  actorName: string | null;
  actorEmail: string | null;
  actorUserId: string | null;
};
