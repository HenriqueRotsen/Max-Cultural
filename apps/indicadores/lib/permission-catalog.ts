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
  "formularios:write",
  "formularios:review",
  "formularios:merge",
  "consultas:cpf",
  "consultas:territorio",
  "usuarios:read",
  "usuarios:write",
  "roles:read",
  "roles:write",
  "audit:read",
  "perfil:write",
  "acompanhamento:read",
  "comunicacao:write",
  "producao:write",
  "acompanhamento:gestao",
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
    label: "Ver contextos, projetos e ações",
    group: "Hierarquia",
  },
  {
    code: "contextos:create",
    label: "Cadastrar contextos, projetos e ações",
    group: "Hierarquia",
    description:
      "Permite criar itens e excluir os que ainda não tenham dados vinculados.",
  },
  {
    code: "contextos:write",
    label: "Editar contextos, projetos e ações",
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
    code: "formularios:write",
    label: "Criar e editar formulários",
    group: "Formulários",
    description: "Criar formulários por ação, capa, campos e professores.",
  },
  {
    code: "formularios:review",
    label: "Avaliar respostas de formulários",
    group: "Formulários",
    description:
      "Papel Professor: ver e marcar Selecionado/Professor nas ações atribuídas.",
  },
  {
    code: "formularios:merge",
    label: "Mesclar respostas na base",
    group: "Formulários",
    description: "Enviar respostas aprovadas para a base completa.",
  },
  {
    code: "consultas:cpf",
    label: "Consultar CPF",
    group: "Consultas",
    description: "Respeita o acesso por contexto/projeto/ação do usuário.",
  },
  {
    code: "consultas:territorio",
    label: "Consultar território",
    group: "Consultas",
    description: "Respeita o acesso por contexto/projeto/ação do usuário.",
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
  {
    code: "acompanhamento:read",
    label: "Ver acompanhamento",
    group: "Acompanhamento",
    description: "Ver as tarefas de Comunicação e Produção dos projetos.",
  },
  {
    code: "comunicacao:write",
    label: "Atualizar tarefas de Comunicação",
    group: "Acompanhamento",
  },
  {
    code: "producao:write",
    label: "Atualizar tarefas de Produção",
    group: "Acompanhamento",
  },
  {
    code: "acompanhamento:gestao",
    label: "Gestão do acompanhamento",
    group: "Acompanhamento",
    description: "Datas do projeto, agenda das ações, ocorrências e escaladas.",
  },
];

export const ADMIN_ROLE_NAME = "Administrador";
export const OPERATOR_ROLE_NAME = "Operador";
export const PROFESSOR_ROLE_NAME = "Professor";
