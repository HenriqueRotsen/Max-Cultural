export type ActionState = {
  error?: string;
  ok?: boolean;
  id?: string;
  message?: string;
  /** Link útil quando o erro tem ação (ex.: NF duplicada em revisão). */
  href?: string;
};
