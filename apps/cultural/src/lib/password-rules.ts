/**
 * Regras de senha forte — usadas no servidor (validateStrongPassword) e no
 * navegador (checklist ao vivo). Sem dependências de Node para rodar no cliente.
 */

export type PasswordRule = {
  id: string;
  /** Texto curto mostrado no checklist. */
  label: string;
  /** Mensagem de erro do servidor quando a regra falha. */
  error: string;
  test: (password: string, email?: string) => boolean;
};

export const PASSWORD_MIN_LENGTH = 10;

function emailLocalPart(email?: string) {
  const local = email?.trim().toLowerCase().split("@")[0] ?? "";
  return local.length >= 3 ? local : "";
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
    error: `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "lower",
    label: "Uma letra minúscula (a–z)",
    error: "Inclua ao menos uma letra minúscula.",
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: "upper",
    label: "Uma letra maiúscula (A–Z)",
    error: "Inclua ao menos uma letra maiúscula.",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "digit",
    label: "Um número (0–9)",
    error: "Inclua ao menos um número.",
    test: (p) => /\d/.test(p),
  },
  {
    id: "symbol",
    label: "Um símbolo (ex.: ! @ # $ %)",
    error: "Inclua ao menos um símbolo (ex.: ! @ # $ %).",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
  {
    id: "email",
    label: "Não conter o seu e-mail",
    error: "A senha não pode conter o e-mail.",
    test: (p, email) => {
      const local = emailLocalPart(email);
      return !local || !p.toLowerCase().includes(local);
    },
  },
];

export function checkPasswordRules(password: string, email?: string) {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    error: rule.error,
    ok: rule.test(password, email),
  }));
}

export type PasswordStrength = {
  /** 0 (vazia) a 4 (forte). */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

/** Medidor simples: regras atendidas + bônus por comprimento. */
export function passwordStrength(password: string, email?: string): PasswordStrength {
  if (!password) return { score: 0, label: "" };
  const checks = checkPasswordRules(password, email);
  const passed = checks.filter((c) => c.ok).length;
  const allOk = passed === checks.length;
  if (!allOk) {
    return passed <= 3 ? { score: 1, label: "Fraca" } : { score: 2, label: "Quase lá" };
  }
  if (password.length >= 14) return { score: 4, label: "Forte" };
  return { score: 3, label: "Boa" };
}
