/** Rótulos amigáveis para ações de auditoria. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login_ok": "Login bem-sucedido",
  "auth.login_failed": "Falha no login",
  "auth.login_partial": "Login parcial (onboarding)",
  "auth.logout": "Logout",
  "auth.password_changed": "Senha alterada",
  "auth.password_reset_requested": "Recuperação de senha solicitada",
  "auth.password_reset_ok": "Senha redefinida",
  "auth.2fa_enabled": "2FA ativado",
  "auth.2fa_disabled": "2FA desativado",
  "auth.2fa_failed": "Falha no 2FA",
  "auth.2fa_email_sent": "Código 2FA enviado por e-mail",
  "user.created": "Usuário criado",
  "user.updated": "Usuário atualizado",
  "user.deactivated": "Usuário desativado",
  "user.reactivated": "Usuário reativado",
  "user.deleted": "Usuário excluído",
  "role.created": "Papel criado",
  "role.updated": "Papel atualizado",
  "role.deleted": "Papel excluído",
  "contexto.created": "Contexto criado",
  "contexto.updated": "Contexto atualizado",
  "contexto.deleted": "Contexto excluído",
  "projeto.created": "Projeto criado",
  "projeto.updated": "Projeto atualizado",
  "projeto.deleted": "Projeto excluído",
  "oficina.created": "Oficina criada",
  "oficina.updated": "Oficina atualizada",
  "oficina.deleted": "Oficina excluída",
  "consulta.cpf": "Consulta de CPF",
  "audit.exported": "Relatório de auditoria exportado",
  "inscricao.updated": "Inscrição atualizada",
  "inscricao.imported": "Inscrições importadas",
};

export const AUDIT_ACTION_GROUPS: Array<{
  value: string;
  label: string;
  prefix: string;
}> = [
  { value: "all", label: "Todas as categorias", prefix: "" },
  { value: "auth", label: "Autenticação", prefix: "auth." },
  { value: "user", label: "Usuários", prefix: "user." },
  { value: "role", label: "Papéis", prefix: "role." },
  { value: "contexto", label: "Contextos", prefix: "contexto." },
  { value: "projeto", label: "Projetos", prefix: "projeto." },
  { value: "oficina", label: "Oficinas", prefix: "oficina." },
  { value: "consulta", label: "Consultas", prefix: "consulta." },
  { value: "inscricao", label: "Inscrições", prefix: "inscricao." },
  { value: "audit", label: "Auditoria", prefix: "audit." },
];

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function describeAuditEvent(input: {
  action: string;
  actorName: string;
  actorEmail?: string;
  entityType?: string;
  entityId?: string;
  meta?: unknown;
  ip?: string | null;
}): string {
  const label = auditActionLabel(input.action);
  const who = input.actorEmail
    ? `${input.actorName} (${input.actorEmail})`
    : input.actorName;
  const entity =
    input.entityType || input.entityId
      ? ` em ${[input.entityType, input.entityId].filter(Boolean).join(" ")}`
      : "";
  const metaBits: string[] = [];
  if (input.meta && typeof input.meta === "object" && input.meta !== null) {
    for (const [k, v] of Object.entries(input.meta as Record<string, unknown>)) {
      if (v == null || v === "") continue;
      metaBits.push(`${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
  }
  const meta = metaBits.length ? ` · ${metaBits.join(", ")}` : "";
  const ip = input.ip ? ` · IP ${input.ip}` : "";
  return `${who}: ${label}${entity}${meta}${ip}`;
}
