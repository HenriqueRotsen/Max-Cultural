/** Catálogo único de acesso: produto, tela e capacidade. */

export type AccessKind = "product" | "screen" | "capability";

export type AccessProductGroup =
  | "Cultural"
  | "Origem"
  | "Fluxo"
  | "Produtos";

export type AccessCatalogEntry = {
  id: string;
  label: string;
  description?: string;
  kind: AccessKind;
  /** Agrupamento na UI de papéis. */
  group: AccessProductGroup;
  /** Produto ao qual a tela/capacidade pertence (para acordeão). */
  product?: "cultural" | "origem" | "fluxo";
  /** Tela ou produto pai (capacidades exigem screen; screens exigem product). */
  parentId?: string;
};

/**
 * Fonte de verdade do hub. Capacidades só listam ações que existem de fato —
 * a UI não inventa "Excluir" / "Editar" onde não há.
 */
export const ACCESS_CATALOG = [
  // —— Cultural ——
  {
    id: "cultural.home",
    label: "Início",
    kind: "screen",
    group: "Cultural",
    product: "cultural",
  },
  {
    id: "cultural.projetos",
    label: "Projetos",
    kind: "screen",
    group: "Cultural",
    product: "cultural",
  },
  {
    id: "cultural.usuarios",
    label: "Usuários",
    kind: "screen",
    group: "Cultural",
    product: "cultural",
  },
  {
    id: "cultural.usuarios.edit",
    label: "Gerenciar usuários",
    description: "Criar, ativar e desativar usuários.",
    kind: "capability",
    group: "Cultural",
    product: "cultural",
    parentId: "cultural.usuarios",
  },
  {
    id: "cultural.papeis",
    label: "Papéis",
    kind: "screen",
    group: "Cultural",
    product: "cultural",
  },
  {
    id: "cultural.papeis.edit",
    label: "Gerenciar papéis e acessos",
    description: "Criar papéis e alterar a matriz de permissões.",
    kind: "capability",
    group: "Cultural",
    product: "cultural",
    parentId: "cultural.papeis",
  },
  {
    id: "cultural.logs",
    label: "Logs",
    kind: "screen",
    group: "Cultural",
    product: "cultural",
  },

  // —— Produtos ——
  {
    id: "origem.app",
    label: "MAX Origem",
    description: "Entrar no produto Origem.",
    kind: "product",
    group: "Produtos",
    product: "origem",
  },
  {
    id: "fluxo.app",
    label: "MAX Fluxo",
    description: "Entrar no produto Fluxo.",
    kind: "product",
    group: "Produtos",
    product: "fluxo",
  },

  // —— Origem telas ——
  {
    id: "origem.proponentes",
    label: "Proponentes",
    kind: "screen",
    group: "Origem",
    product: "origem",
    parentId: "origem.app",
  },
  {
    id: "origem.auditoria",
    label: "Auditoria (relatórios)",
    description: "Relatórios de conformidade SALIC — não é log de acesso.",
    kind: "screen",
    group: "Origem",
    product: "origem",
    parentId: "origem.app",
  },
  {
    id: "origem.fornecedores",
    label: "Fornecedores",
    kind: "screen",
    group: "Origem",
    product: "origem",
    parentId: "origem.app",
  },
  {
    id: "origem.planejamento",
    label: "Planejamento",
    kind: "screen",
    group: "Origem",
    product: "origem",
    parentId: "origem.app",
  },

  // —— Origem capacidades (planejamento) ——
  {
    id: "origem.planejamento.editar_rubricas",
    label: "Editar rubricas",
    description: "Alterar valores e estrutura de rubricas no planejamento.",
    kind: "capability",
    group: "Origem",
    product: "origem",
    parentId: "origem.planejamento",
  },
  {
    id: "origem.planejamento.exceder_rubrica",
    label: "Exceder rubrica",
    description: "Permitir compromisso acima do saldo da rubrica.",
    kind: "capability",
    group: "Origem",
    product: "origem",
    parentId: "origem.planejamento",
  },
  {
    id: "origem.planejamento.subir_salic",
    label: "Enviar projeto ao SALIC",
    kind: "capability",
    group: "Origem",
    product: "origem",
    parentId: "origem.planejamento",
  },
  {
    id: "origem.planejamento.readequacao",
    label: "Readequação de planilha",
    kind: "capability",
    group: "Origem",
    product: "origem",
    parentId: "origem.planejamento",
  },
  {
    id: "origem.planejamento.excluir_nf",
    label: "Excluir NF/RPA",
    kind: "capability",
    group: "Origem",
    product: "origem",
    parentId: "origem.planejamento",
  },

  // —— Fluxo ——
  {
    id: "fluxo.operacao",
    label: "Operação",
    description: "Inscrições, contextos, importação e análise.",
    kind: "screen",
    group: "Fluxo",
    product: "fluxo",
    parentId: "fluxo.app",
  },
  {
    id: "fluxo.consultas",
    label: "Consultas",
    description: "Consultas de CPF e território.",
    kind: "screen",
    group: "Fluxo",
    product: "fluxo",
    parentId: "fluxo.app",
  },
] as const satisfies readonly AccessCatalogEntry[];

export type AccessPermissionId = (typeof ACCESS_CATALOG)[number]["id"];

export const ACCESS_PERMISSION_IDS = ACCESS_CATALOG.map((e) => e.id);

export const ACCESS_BY_ID: Record<string, AccessCatalogEntry> = Object.fromEntries(
  ACCESS_CATALOG.map((e) => [e.id, e]),
);

/** Capacidades privilegiadas de planejamento (Operador não recebe no seed). */
export const ORIGEM_PRIVILEGED_CAPABILITIES = [
  "origem.planejamento.exceder_rubrica",
  "origem.planejamento.subir_salic",
  "origem.planejamento.readequacao",
  "origem.planejamento.excluir_nf",
  "origem.planejamento.editar_rubricas",
] as const;

/** Mapeamento hub → códigos locais do Fluxo (interseção no satélite). */
export const HUB_TO_FLUXO_PERMISSIONS: Record<string, readonly string[]> = {
  "fluxo.app": ["dashboard:access", "perfil:write"],
  "fluxo.operacao": [
    "inscricoes:read",
    "inscricoes:write",
    "inscricoes:export",
    "analise:read",
    "analise:export",
    "contextos:read",
    "contextos:create",
    "contextos:write",
    "import:write",
  ],
  "fluxo.consultas": ["consultas:cpf", "consultas:territorio"],
};

export function isAccessPermissionId(id: string): id is AccessPermissionId {
  return id in ACCESS_BY_ID;
}

export function childrenOf(parentId: string): AccessCatalogEntry[] {
  return ACCESS_CATALOG.filter((e) => e.parentId === parentId);
}

export function productSections(): Array<{
  product: "cultural" | "origem" | "fluxo";
  label: string;
  productId?: AccessPermissionId;
  entries: AccessCatalogEntry[];
}> {
  return [
    {
      product: "cultural",
      label: "Cultural (hub)",
      entries: ACCESS_CATALOG.filter((e) => e.product === "cultural"),
    },
    {
      product: "origem",
      label: "MAX Origem",
      productId: "origem.app",
      entries: ACCESS_CATALOG.filter(
        (e) => e.product === "origem" && e.id !== "origem.app",
      ),
    },
    {
      product: "fluxo",
      label: "MAX Fluxo",
      productId: "fluxo.app",
      entries: ACCESS_CATALOG.filter(
        (e) => e.product === "fluxo" && e.id !== "fluxo.app",
      ),
    },
  ];
}

/** Converte linhas legadas RolePermission → set de IDs concedidos. */
export function grantedIdsFromRoleRows(
  rows: Array<{ screen: string; canView: boolean; canEdit: boolean }>,
): Set<string> {
  const granted = new Set<string>();
  for (const row of rows) {
    if (!row.canView && !row.canEdit) continue;
    granted.add(row.screen);
    // Legado: canEdit na tela → capability `.edit` se existir no catálogo.
    if (row.canEdit) {
      const editId = `${row.screen}.edit`;
      if (ACCESS_BY_ID[editId]) granted.add(editId);
      // Features antigas usavam canEdit como “pode a feature”.
      const entry = ACCESS_BY_ID[row.screen];
      if (entry?.kind === "capability") granted.add(row.screen);
    }
  }
  return granted;
}

/** Expand grants: se capability concedida, garante parent screen (não produto). */
export function normalizeGrantedIds(ids: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const id of ids) {
    if (!ACCESS_BY_ID[id]) continue;
    set.add(id);
  }
  // Garante pais de capacidades (telas).
  for (const id of [...set]) {
    let cur = ACCESS_BY_ID[id];
    while (cur?.parentId) {
      const parent = ACCESS_BY_ID[cur.parentId];
      if (!parent) break;
      if (parent.kind === "screen" || parent.kind === "product") {
        set.add(parent.id);
      }
      cur = parent;
    }
  }
  return ACCESS_PERMISSION_IDS.filter((id) => set.has(id));
}
