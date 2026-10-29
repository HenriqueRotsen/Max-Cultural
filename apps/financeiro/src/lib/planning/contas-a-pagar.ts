export type ContasAPagarRow = {
  id: string;
  amount: number;
  expectedPayAt: string;
  status: string;
  installmentNumber: number | null;
  planningProjectId: string;
  externalCode: string;
  projectName: string | null;
  supplierName: string;
  supplierCnpj: string;
  rubricLabel: string;
  origin: "pedido" | "reserva";
  pedidoId: string | null;
};

export type ContasAPagarDueFilter = "all" | "overdue" | "upcoming" | "later";
export type ContasAPagarOriginFilter = "all" | "pedido" | "reserva";
export type ContasAPagarSort =
  | "due_asc"
  | "due_desc"
  | "amount_desc"
  | "amount_asc"
  | "project_asc"
  | "project_desc"
  | "supplier_asc"
  | "supplier_desc"
  | "rubric_asc"
  | "rubric_desc"
  | "origin_asc"
  | "origin_desc";

export type ContasAPagarFilters = {
  projectId: string;
  supplier: string;
  origin: ContasAPagarOriginFilter;
  due: ContasAPagarDueFilter;
  from: string;
  to: string;
  sort: ContasAPagarSort;
  query: string;
};

export const DEFAULT_CONTAS_FILTERS: ContasAPagarFilters = {
  projectId: "",
  supplier: "",
  origin: "all",
  due: "all",
  from: "",
  to: "",
  sort: "due_asc",
  query: "",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDateInput(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return new Date(`${raw}T12:00:00`);
}

export function filterAndSortContasAPagar(
  rows: ContasAPagarRow[],
  filters: ContasAPagarFilters,
  now = new Date(),
  upcomingDays = 5,
): ContasAPagarRow[] {
  const today = startOfDay(now);
  const upcomingLimit = new Date(today);
  upcomingLimit.setDate(
    upcomingLimit.getDate() + Math.max(1, Math.min(30, upcomingDays)),
  );
  const from = parseDateInput(filters.from);
  const to = parseDateInput(filters.to);
  const q = filters.query.trim().toLowerCase();

  let list = rows.filter((row) => {
    if (filters.projectId && row.planningProjectId !== filters.projectId) {
      return false;
    }
    if (filters.supplier && row.supplierName !== filters.supplier) {
      return false;
    }
    if (filters.origin !== "all" && row.origin !== filters.origin) {
      return false;
    }

    const due = startOfDay(new Date(row.expectedPayAt));
    if (from && due < startOfDay(from)) return false;
    if (to && due > startOfDay(to)) return false;

    if (filters.due === "overdue" && !(due < today)) return false;
    if (filters.due === "upcoming") {
      if (!(due >= today && due <= upcomingLimit)) return false;
    }
    if (filters.due === "later" && !(due > upcomingLimit)) return false;

    if (q) {
      const hay = [
        row.externalCode,
        row.projectName || "",
        row.supplierName,
        row.supplierCnpj,
        row.rubricLabel,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  list = [...list].sort((a, b) => {
    switch (filters.sort) {
      case "due_desc":
        return b.expectedPayAt.localeCompare(a.expectedPayAt);
      case "amount_desc":
        return b.amount - a.amount;
      case "amount_asc":
        return a.amount - b.amount;
      case "project_asc":
        return a.externalCode.localeCompare(b.externalCode, "pt-BR");
      case "project_desc":
        return b.externalCode.localeCompare(a.externalCode, "pt-BR");
      case "supplier_asc":
        return a.supplierName.localeCompare(b.supplierName, "pt-BR");
      case "supplier_desc":
        return b.supplierName.localeCompare(a.supplierName, "pt-BR");
      case "rubric_asc":
        return a.rubricLabel.localeCompare(b.rubricLabel, "pt-BR");
      case "rubric_desc":
        return b.rubricLabel.localeCompare(a.rubricLabel, "pt-BR");
      case "origin_asc":
        return a.origin.localeCompare(b.origin, "pt-BR");
      case "origin_desc":
        return b.origin.localeCompare(a.origin, "pt-BR");
      case "due_asc":
      default:
        return a.expectedPayAt.localeCompare(b.expectedPayAt);
    }
  });

  return list;
}

export function toggleContasAPagarSort(
  current: ContasAPagarSort,
  column:
    | "due"
    | "amount"
    | "project"
    | "supplier"
    | "rubric"
    | "origin",
): ContasAPagarSort {
  const map: Record<
    typeof column,
    { asc: ContasAPagarSort; desc: ContasAPagarSort }
  > = {
    due: { asc: "due_asc", desc: "due_desc" },
    amount: { asc: "amount_asc", desc: "amount_desc" },
    project: { asc: "project_asc", desc: "project_desc" },
    supplier: { asc: "supplier_asc", desc: "supplier_desc" },
    rubric: { asc: "rubric_asc", desc: "rubric_desc" },
    origin: { asc: "origin_asc", desc: "origin_desc" },
  };
  const pair = map[column];
  if (current === pair.asc) return pair.desc;
  if (current === pair.desc) return pair.asc;
  // Default direction when switching column
  if (column === "amount") return pair.desc;
  return pair.asc;
}

export function contasAPagarSortDirection(
  sort: ContasAPagarSort,
  column:
    | "due"
    | "amount"
    | "project"
    | "supplier"
    | "rubric"
    | "origin",
): "asc" | "desc" | null {
  if (sort === `${column}_asc`) return "asc";
  if (sort === `${column}_desc`) return "desc";
  return null;
}

export function parseContasAPagarFilters(
  params: URLSearchParams,
): ContasAPagarFilters {
  const sortRaw = params.get("sort") || DEFAULT_CONTAS_FILTERS.sort;
  const dueRaw = params.get("due") || DEFAULT_CONTAS_FILTERS.due;
  const originRaw = params.get("origin") || DEFAULT_CONTAS_FILTERS.origin;
  const normalizedSort =
    sortRaw === "project"
      ? "project_asc"
      : sortRaw === "supplier"
        ? "supplier_asc"
        : sortRaw;
  const sort = (
    [
      "due_asc",
      "due_desc",
      "amount_desc",
      "amount_asc",
      "project_asc",
      "project_desc",
      "supplier_asc",
      "supplier_desc",
      "rubric_asc",
      "rubric_desc",
      "origin_asc",
      "origin_desc",
    ] as ContasAPagarSort[]
  ).includes(normalizedSort as ContasAPagarSort)
    ? (normalizedSort as ContasAPagarSort)
    : DEFAULT_CONTAS_FILTERS.sort;
  const due = (
    ["all", "overdue", "upcoming", "later"] as ContasAPagarDueFilter[]
  ).includes(dueRaw as ContasAPagarDueFilter)
    ? (dueRaw as ContasAPagarDueFilter)
    : DEFAULT_CONTAS_FILTERS.due;
  const origin = (
    ["all", "pedido", "reserva"] as ContasAPagarOriginFilter[]
  ).includes(originRaw as ContasAPagarOriginFilter)
    ? (originRaw as ContasAPagarOriginFilter)
    : DEFAULT_CONTAS_FILTERS.origin;

  return {
    projectId: params.get("projectId") || "",
    supplier: params.get("supplier") || "",
    origin,
    due,
    from: params.get("from") || "",
    to: params.get("to") || "",
    sort,
    query: params.get("q") || "",
  };
}

export function contasAPagarFiltersToSearchParams(
  filters: ContasAPagarFilters,
): URLSearchParams {
  const qs = new URLSearchParams();
  if (filters.projectId) qs.set("projectId", filters.projectId);
  if (filters.supplier) qs.set("supplier", filters.supplier);
  if (filters.origin !== "all") qs.set("origin", filters.origin);
  if (filters.due !== "all") qs.set("due", filters.due);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.sort !== "due_asc") qs.set("sort", filters.sort);
  if (filters.query.trim()) qs.set("q", filters.query.trim());
  return qs;
}

export function contasAPagarFilterLabels(filters: ContasAPagarFilters): string[] {
  const labels: string[] = [];
  if (filters.projectId) labels.push(`Projeto filtrado`);
  if (filters.supplier) labels.push(`Fornecedor: ${filters.supplier}`);
  if (filters.origin === "pedido") labels.push("Origem: pedidos");
  if (filters.origin === "reserva") labels.push("Origem: reservas");
  if (filters.due === "overdue") labels.push("Somente vencidos");
  if (filters.due === "upcoming") labels.push("Vence em até 14 dias");
  if (filters.due === "later") labels.push("Vence após 14 dias");
  if (filters.from) labels.push(`De ${filters.from}`);
  if (filters.to) labels.push(`Até ${filters.to}`);
  if (filters.query.trim()) labels.push(`Busca: ${filters.query.trim()}`);
  const sortLabel: Record<ContasAPagarSort, string> = {
    due_asc: "Ordenado por vencimento (↑)",
    due_desc: "Ordenado por vencimento (↓)",
    amount_desc: "Ordenado por valor (maior)",
    amount_asc: "Ordenado por valor (menor)",
    project_asc: "Ordenado por projeto (A–Z)",
    project_desc: "Ordenado por projeto (Z–A)",
    supplier_asc: "Ordenado por fornecedor (A–Z)",
    supplier_desc: "Ordenado por fornecedor (Z–A)",
    rubric_asc: "Ordenado por rubrica (A–Z)",
    rubric_desc: "Ordenado por rubrica (Z–A)",
    origin_asc: "Ordenado por origem (A–Z)",
    origin_desc: "Ordenado por origem (Z–A)",
  };
  labels.push(sortLabel[filters.sort]);
  return labels;
}
