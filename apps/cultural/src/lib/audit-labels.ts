/** Rótulos amigáveis para a trilha central de auditoria (hub). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login_ok": "Login bem-sucedido",
  "auth.login_failed": "Falha no login",
  "auth.login_partial": "Login parcial (onboarding)",
  "auth.logout": "Logout",
  "auth.password_changed": "Senha alterada",
  "auth.profile_updated": "Perfil atualizado",
  "auth.2fa_enabled": "2FA ativado",
  "auth.2fa_failed": "Falha no 2FA",
  "iam.user_created": "Usuário criado",
  "iam.user_activated": "Usuário reativado",
  "iam.user_deactivated": "Usuário desativado",
  "iam.user_permissions_updated": "Acessos do usuário ajustados",
  "iam.user_role_changed": "Papel do usuário alterado",
  "iam.role_created": "Papel criado",
  "iam.role_updated": "Papel atualizado",
  "iam.role_deleted": "Papel excluído",
  "iam.2fa_reset": "2FA redefinido pelo admin",
  "planning.nf_deleted": "NF excluída",
  "planning.nf_delete_denied": "Exclusão de NF negada",
  "planning.rubrics_edited": "Rubricas editadas",
  "planning.rubric_edit_denied": "Edição de rubrica negada",
  "planning.readequacao_applied": "Readequação aplicada",
  "planning.salic_published": "Publicação SALIC",
  "planning.pedido_created": "Pedido criado",
  "planning.pedido_cancelled": "Pedido cancelado",
  "auth.password_reset_requested": "Recuperação de senha solicitada",
  "auth.password_reset_ok": "Senha redefinida",
  "auth.2fa_disabled": "2FA desativado",
  "inscricao.imported": "Inscrições importadas",
  "import.confirmed": "Importação confirmada",
  "inscricao.updated": "Inscrição atualizada",
  "inscricao.deleted": "Inscrição excluída",
  "consulta.cpf": "Consulta de CPF",
  "contexto.created": "Contexto criado",
  "contexto.updated": "Contexto atualizado",
  "contexto.deleted": "Contexto excluído",
  "projeto.created": "Projeto criado",
  "projeto.updated": "Projeto atualizado",
  "projeto.deleted": "Projeto excluído",
  "oficina.created": "Oficina criada",
  "oficina.updated": "Oficina atualizada",
  "oficina.deleted": "Oficina excluída",
  "user.created": "Usuário criado (Fluxo)",
  "user.updated": "Usuário atualizado (Fluxo)",
  "role.created": "Papel criado (Fluxo)",
  "role.updated": "Papel atualizado (Fluxo)",
  "audit.exported": "Exportação de auditoria",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditScreenLabel(screen: string): string {
  if (!screen) return "—";
  if (screen.startsWith("origem.")) return screen.replace(/^origem\./, "Origem · ");
  if (screen.startsWith("fluxo.")) return screen.replace(/^fluxo\./, "Fluxo · ");
  if (screen.startsWith("cultural.")) return screen.replace(/^cultural\./, "Cultural · ");
  return screen;
}
