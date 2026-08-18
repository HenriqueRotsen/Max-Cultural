import "dotenv/config";
import { prisma } from "../src/lib/db";
import { listFornecedoresByPronac, listProdutosByFornecedor } from "../src/lib/salic/api";
import { syncProjectViaApi } from "../src/lib/salic/persist";

const PRONAC = "153774";
const CNPJ = "20389940000121";

async function main() {
  const { ensureBootstrapWorkspace } = await import("../src/lib/auth/workspace");
  const workspace = await ensureBootstrapWorkspace();

  const account = await prisma.salicAccount.upsert({
    where: {
      workspaceId_cgccpf: { workspaceId: workspace.id, cgccpf: CNPJ },
    },
    create: {
      name: "VIVAS CULTURA E ESPORTE LTDA",
      cgccpf: CNPJ,
      active: true,
      workspaceId: workspace.id,
    },
    update: {
      name: "VIVAS CULTURA E ESPORTE LTDA",
      active: true,
    },
  });

  console.log("Conta:", account.id);

  const fornecedores = await listFornecedoresByPronac(PRONAC);
  console.log(`Fornecedores API: ${fornecedores.length}`);

  const result = await syncProjectViaApi({
    salicAccountId: account.id,
    pronac: PRONAC,
    projectName: "Absurdus: Murilo Rubião 100 anos",
  });

  console.log("Sync:", result.paymentsUpserted, "pagamentos,", result.fornecedoresCount, "fornecedores");

  const payments = await prisma.payment.findMany({
    where: { project: { pronac: PRONAC, salicAccountId: account.id } },
    include: { supplier: true },
    orderBy: [{ paymentDate: "asc" }, { amount: "desc" }],
  });

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);
  console.log(`Linhas no banco: ${payments.length}`);
  console.log(`Total: R$ ${total.toFixed(2)}`);

  // Sample comparisons from PDF
  const samples = [
    { name: "EDITORA PULO", amount: 4410, doc: "09" },
    { name: "MARCELO DORELLA", amount: 7500, doc: "45730" },
    { name: "CAPSULA CULTURA", amount: 26068, doc: "04" },
    { name: "VIVAS CULTURA", amount: 30050, doc: "002" },
    { name: "VOLTZ DESIGN", amount: 10640, doc: "17" },
  ];

  console.log("\nComparação com PDF:");
  for (const sample of samples) {
    const hit = payments.find(
      (p) =>
        p.supplier.name.toUpperCase().includes(sample.name) &&
        Math.abs(Number(p.amount) - sample.amount) < 0.01,
    );
    console.log(
      hit
        ? `OK  ${sample.name} R$ ${sample.amount} → ${hit.documentNumber || "?"} / ${hit.itemName || "?"}`
        : `MISS ${sample.name} R$ ${sample.amount}`,
    );
  }

  // Show a few rows
  console.log("\nPrimeiras 8 linhas:");
  for (const p of payments.slice(0, 8)) {
    console.log(
      `- ${p.supplier.name.slice(0, 40).padEnd(40)} ${String(Number(p.amount)).padStart(10)} ${p.documentNumber || ""} ${p.itemName || ""}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
