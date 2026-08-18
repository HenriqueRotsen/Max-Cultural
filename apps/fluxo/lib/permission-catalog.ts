/** Catálogo estável de permissões de tela/ação */
export const PERMISSION_CODES = [
  "dashboard:access",
  "inscricoes:read",
  "inscricoes:write",
  "inscricoes:export",
  "analise:read",
  "analise:export",
  "contextos:read",
  "contextos:create",
  "contextos:write",
  "import:write",
  "consultas:cpf",
  "consultas:territorio",
  "usuarios:read",
  "usuarios:write",
  "roles:read",
  "roles:write",
  "audit:read",
  "perfil:write",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const PERMISSION_CATALOG: Array<{
  code: PermissionCode;
  label: string;
  group: string;
  description?: string;
}> = [
  {
    code: "dashboard:access",
    label: "Acessar o painel",
    group: "Painel",
  },
  {
    code: "inscricoes:read",
    label: "Ver inscrições",
    group: "Inscrições",
  },
  {
    code: "inscricoes:write",
    label: "Editar inscrições",
    group: "Inscrições",
  },
  {
    code: "inscricoes:export",
    label: "Exportar inscrições",
    group: "Inscrições",
  },
  {
    code: "analise:read",
    label: "Ver análise",
    group: "Análise",
  },
  {
    code: "analise:export",
    label: "Exportar análise",
    group: "Análise",
  },
  {
    code: "contextos:read",
    label: "Ver contextos, projetos e oficinas",
    group: "Hierarquia",
  },
  {
    code: "contextos:create",
    label: "Cadastrar contextos, projetos e oficinas",
    group: "Hierarquia",
    description:
      "Permite criar itens e excluir os que ainda não tenham dados vinculados.",
  },
  {
    code: "contextos:write",
    label: "Editar contextos, projetos e oficinas",
    group: "Hierarquia",
    description:
      "Permite alterar nomes e vínculos. Também aparece na auditoria. Exclusão só sem dados vinculados.",
  },
  {
    code: "import:write",
    label: "Importar planilhas",
    group: "Importação",
  },
  {
    code: "consultas:cpf",
    label: "Consultar CPF",
    group: "Consultas",
    description: "Respeita o acesso por contexto/projeto/oficina do usuário.",
  },
  {
    code: "consultas:territorio",
    label: "Consultar território",
    group: "Consultas",
    description: "Respeita o acesso por contexto/projeto/oficina do usuário.",
  },
  {
    code: "usuarios:read",
    label: "Ver usuários",
    group: "Acesso",
  },
  {
    code: "usuarios:write",
    label: "Gerenciar usuários",
    group: "Acesso",
  },
  {
    code: "roles:read",
    label: "Ver papéis",
    group: "Acesso",
  },
  {
    code: "roles:write",
    label: "Gerenciar papéis",
    group: "Acesso",
  },
  {
    code: "audit:read",
    label: "Ver auditoria",
    group: "Acesso",
  },
  {
    code: "perfil:write",
    label: "Editar próprio perfil",
    group: "Perfil",
  },
];

export const ADMIN_ROLE_NAME = "Administrador";
export const OPERATOR_ROLE_NAME = "Operador";
