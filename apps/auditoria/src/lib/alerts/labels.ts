export const ALERT_STATUS_LABEL: Record<string, string> = {
  NOVO: "Novo",
  VISTO: "Visto",
  RESOLVIDO: "Resolvido",
};

export const ALERT_STATUS_BADGE: Record<string, string> = {
  NOVO: "badge-danger",
  VISTO: "badge-warn",
  RESOLVIDO: "badge-success",
};

export const ALERT_TYPE_LABEL: Record<string, string> = {
  DILIGENCIA: "Diligência",
};

export function formatDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
