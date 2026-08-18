import "dotenv/config";
import { runNormSync } from "../src/lib/norm/sync";
import { prisma } from "../src/lib/db";

async function main() {
  const result = await runNormSync();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
