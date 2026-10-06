/**
 * Garante papel Superadmin + conta protegida no banco.
 * Uso: npx tsx scripts/ensure-protected-superadmin.ts
 */
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { ensureProtectedSuperAdmin } = await import(
    "../src/lib/ensure-protected-superadmin"
  );
  const { PROTECTED_SUPERADMIN_EMAIL } = await import(
    "../src/lib/protected-superadmin"
  );
  const { prisma } = await import("../src/lib/db");

  const result = await ensureProtectedSuperAdmin();
  if (result.missingUser) {
    console.error(
      `Usuário ${PROTECTED_SUPERADMIN_EMAIL} não existe. Rode o seed com BOOTSTRAP_ADMIN_* ou crie a conta antes.`,
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: PROTECTED_SUPERADMIN_EMAIL },
    include: { role: true },
  });
  console.log("Superadmin protegido OK:", {
    email: user?.email,
    role: user?.role.name,
    isSuperAdmin: user?.isSuperAdmin,
    deactivatedAt: user?.deactivatedAt,
  });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
