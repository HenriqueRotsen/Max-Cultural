import { prisma } from "@/lib/db";
import { seedComplianceCatalog } from "@/lib/compliance/seed-catalog";
import { ensureProjectRuleset } from "@/lib/compliance/choose-ruleset";

async function main() {
  console.log("Seeding compliance catalog…");
  await seedComplianceCatalog();

  const projects = await prisma.project.findMany({
    where: { complianceRulesetId: null },
    select: { id: true, pronac: true },
    take: 500,
  });
  console.log(`Projetos sem IN: ${projects.length}`);

  for (const p of projects) {
    try {
      const result = await ensureProjectRuleset(p.id);
      console.log(p.pronac, result);
    } catch (error) {
      console.warn(p.pronac, error instanceof Error ? error.message : error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
