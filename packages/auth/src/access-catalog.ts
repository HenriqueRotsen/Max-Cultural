/** Catálogo único de acesso: produto, tela e capacidade. */

export type AccessKind = "product" | "screen" | "capability";

export type AccessProductGroup =
  | "Cultural"
  | "Financeiro"
  | "Indicadores"
  | "Auditoria"
  | "Produtos";

export type AccessCatalogEntry = {
  id: string;
  label: string;
  description?: string;
  kind: AccessKind;
  /** Agrupamento na UI de papéis. */
  group: AccessProductGroup;
  /** Produto ao qual a tela/capacidade pertence (para acordeão). */
  product?: "cultural" | "financeiro" | "indicadores" | "auditoria";
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
    id: "financeiro.app",
    label: "MAX Financeiro",
    description: "Entrar no produto Financeiro.",
    kind: "product",
    group: "Produtos",
    product: "financeiro",
  },
  {
    id: "indicadores.app",
    label: "MAX Indicadores",
    description: "Entrar no produto Indicadores.",
    kind: "product",
    group: "Produtos",
    product: "indicadores",
  },
  {
    id: "auditoria.app",
    label: "MAX Auditoria (antigo Salink)",
    description:
      "Entrar na Auditoria: espelho do SALIC, panorama, observados e relatórios. Não altera os outros módulos.",
    kind: "product",
    group: "Produtos",
    product: "auditoria",
  },

  // —— Financeiro telas ——
  {
    id: "financeiro.proponentes",
    label: "Proponentes",
    kind: "screen",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.app",
  },
  {
    id: "financeiro.auditoria",
    label: "Auditoria (relatórios)",
    description: "Relatórios de conformidade SALIC — não é log de acesso.",
    kind: "screen",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.app",
  },
  {
    id: "financeiro.fornecedores",
    label: "Fornecedores",
    kind: "screen",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.app",
  },
  {
    id: "financeiro.planejamento",
    label: "Planejamento",
    kind: "screen",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.app",
  },

  // —— Financeiro capacidades (planejamento) ——
  {
    id: "financeiro.planejamento.editar_rubricas",
    label: "Editar rubricas",
    description: "Alterar valores e estrutura de rubricas no planejamento.",
    kind: "capability",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.planejamento",
  },
  {
    id: "financeiro.planejamento.exceder_rubrica",
    label: "Exceder rubrica",
    description: "Permitir compromisso acima do saldo da rubrica.",
    kind: "capability",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.planejamento",
  },
  {
    id: "financeiro.planejamento.subir_salic",
    label: "Enviar projeto ao SALIC",
    kind: "capability",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.planejamento",
  },
  {
    id: "financeiro.planejamento.readequacao",
    label: "Readequação de planilha",
    kind: "capability",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.planejamento",
  },
  {
    id: "financeiro.planejamento.excluir_nf",
    label: "Excluir NF/RPA",
    kind: "capability",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.planejamento",
  },
  {
    id: "financeiro.planejamento.encerrar",
    label: "Encerrar projeto",
    description: "Encerra o projeto (confirmação dupla); depois disso ele some do Financeiro.",
    kind: "capability",
    group: "Financeiro",
    product: "financeiro",
    parentId: "financeiro.planejamento",
  },

  // —— Auditoria ——
  {
    id: "auditoria.atualizacao",
    label: "Atualização SALIC",
    description:
      "Ver o status e disparar a atualização com o SALIC (quem entra na Auditoria já vê).",
    kind: "screen",
    group: "Auditoria",
    product: "auditoria",
    parentId: "auditoria.app",
  },
  {
    id: "auditoria.atualizacao.desativar",
    label: "Desativar atualização automática",
    description:
      "Desliga (ou religa) a atualização diária com o SALIC — confirmação dupla.",
    kind: "capability",
    group: "Auditoria",
    product: "auditoria",
    parentId: "auditoria.atualizacao",
  },

  // —— Indicadores ——
  {
    id: "indicadores.operacao",
    label: "Operação",
    description: "Inscrições, contextos, importação, formulários e análise.",
    kind: "screen",
    group: "Indicadores",
    product: "indicadores",
    parentId: "indicadores.app",
  },
  {
    id: "indicadores.formularios",
    label: "Avaliação de formulários",
    description:
      "Somente respostas das oficinas em que é professor (papel Professor).",
    kind: "screen",
    group: "Indicadores",
    product: "indicadores",
    parentId: "indicadores.app",
  },
  {
    id: "indicadores.consultas",
    label: "Consultas",
    description: "Consultas de CPF e território.",
    kind: "screen",
    group: "Indicadores",
    product: "indicadores",
    parentId: "indicadores.app",
  },
] as const satisfies readonly AccessCatalogEntry[];

export type AccessPermissionId = (typeof ACCESS_CATALOG)[number]["id"];

export const ACCESS_PERMISSION_IDS = ACCESS_CATALOG.map((e) => e.id);

export const ACCESS_BY_ID: Record<string, AccessCatalogEntry> = Object.fromEntries(
  ACCESS_CATALOG.map((e) => [e.id, e]),
);

/** Capacidades privilegiadas de planejamento (Operador não recebe no seed). */
export const FINANCEIRO_PRIVILEGED_CAPABILITIES = [
  "financeiro.planejamento.exceder_rubrica",
  "financeiro.planejamento.subir_salic",
  "financeiro.planejamento.readequacao",
  "financeiro.planejamento.excluir_nf",
  "financeiro.planejamento.editar_rubricas",
  "financeiro.planejamento.encerrar",
] as const;

/** Mapeamento hub → códigos locais do Indicadores (interseção no satélite). */
export const HUB_TO_INDICADORES_PERMISSIONS: Record<string, readonly string[]> = {
  "indicadores.app": ["dashboard:access", "perfil:write"],
  "indicadores.operacao": [
    "inscricoes:read",
    "inscricoes:write",
    "inscricoes:export",
    "analise:read",
    "analise:export",
    "contextos:read",
    "contextos:create",
    "contextos:write",
    "import:write",
    "formularios:write",
    "formularios:review",
    "formularios:merge",
  ],
  /** Papel Professor: só fila de respostas das oficinas atribuídas. */
  "indicadores.formularios": ["formularios:review"],
  "indicadores.consultas": ["consultas:cpf", "consultas:territorio"],
  /**
   * IAM do hub → gestão de usuários/escopos no Indicadores (menu Acesso).
   * Escopo de contextos/projetos/oficinas só existe no satélite.
   */
  "cultural.usuarios": ["usuarios:read", "roles:read", "audit:read"],
  "cultural.usuarios.edit": ["usuarios:write", "roles:write"],
};

/**
 * Ids antigos (MAX Origem → Financeiro, MAX Fluxo → Indicadores) ainda presentes em
 * cookies de sessão emitidos antes da troca de nome.
 */
export function normalizeLegacyAccessId(id: string): string {
  if (id.startsWith("origem.")) return `financeiro.${id.slice(7)}`;
  if (id.startsWith("fluxo.")) return `indicadores.${id.slice(6)}`;
  return id;
}

export function isAccessPermissionId(id: string): id is AccessPermissionId {
  return id in ACCESS_BY_ID;
}

export function childrenOf(parentId: string): AccessCatalogEntry[] {
  return (ACCESS_CATALOG as readonly AccessCatalogEntry[]).filter(
    (e) => e.parentId === parentId,
  );
}

export function productSections(): Array<{
  product: "cultural" | "financeiro" | "indicadores" | "auditoria";
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
      product: "financeiro",
      label: "MAX Financeiro",
      productId: "financeiro.app",
      entries: ACCESS_CATALOG.filter(
        (e) => e.product === "financeiro" && e.id !== "financeiro.app",
      ),
    },
    {
      product: "indicadores",
      label: "MAX Indicadores",
      productId: "indicadores.app",
      entries: ACCESS_CATALOG.filter(
        (e) => e.product === "indicadores" && e.id !== "indicadores.app",
      ),
    },
    {
      product: "auditoria",
      label: "MAX Auditoria (antigo Salink)",
      productId: "auditoria.app",
      entries: ACCESS_CATALOG.filter(
        (e) => e.product === "auditoria" && e.id !== "auditoria.app",
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

/** Aplica overrides por usuário sobre o conjunto do papel (GRANT adiciona, DENY remove). */
export function applyPermissionOverrides(
  base: Iterable<string>,
  overrides: Array<{ screen: string; effect: "GRANT" | "DENY" }>,
): Set<string> {
  const granted = new Set(base);
  for (const o of overrides) {
    if (!ACCESS_BY_ID[o.screen]) continue;
    if (o.effect === "GRANT") granted.add(o.screen);
    if (o.effect === "DENY") granted.delete(o.screen);
  }
  return granted;
}
