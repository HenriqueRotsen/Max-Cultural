/** Conta raiz do hub — papel Superadmin imutável. */
export const PROTECTED_SUPERADMIN_EMAIL = (
  process.env.PROTECTED_SUPERADMIN_EMAIL ||
  process.env.BOOTSTRAP_ADMIN_EMAIL ||
  "comercial.henriquerotsen@gmail.com"
)
  .trim()
  .toLowerCase();

export const SUPERADMIN_ROLE_NAME = "Superadmin";

export function isProtectedSuperAdminEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase() === PROTECTED_SUPERADMIN_EMAIL;
}

export function protectedSuperAdminDeniedMessage() {
  return "Esta conta Superadmin é protegida e não pode ser alterada.";
}
