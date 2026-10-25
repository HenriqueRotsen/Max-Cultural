import "dotenv/config";
import { prisma } from "../src/lib/db";
import { listProdutosByFornecedor } from "../src/lib/salic/api";
import { upsertPaymentFromProduto, upsertSupplier } from "../src/lib/salic/persist";

async function main() {
  const existing = await prisma.payment.findMany({
    where: { project: { pronac: "153774" } },
    include: { supplier: true },
  });
  const totalExisting = existing.reduce((s, p) => s + Number(p.amount), 0);
  console.log("Já no banco:", existing.length, "R$", totalExisting.toFixed(2));

  // Sync a few known suppliers from PDF quickly
  const targets = [
    {
      id: "9f8777e15d23650e864d74435f86a9a6bd014fa751fb42170abe1dc97774",
      expect: "VOLTZ",
    },
  ];

  // resolve more by name
  const { searchFornecedores } = await import("../src/lib/salic/api");
  for (const nome of [
    "EDITORA PULO",
    "CAPSULA CULTURA",
    "VIVAS CULTURA",
    "ARTE EM IMPRESSAO",
    "MARCELO DORELLA",
  ]) {
    const found = await searchFornecedores({ nome });
    const withPronac = found; // search is global; we'll filter produtos
    if (withPronac[0]?.salicId) {
      targets.push({ id: withPronac[0].salicId, expect: nome });
      console.log("Resolvido", nome, "→", withPronac[0].nome, withPronac[0].salicId.slice(0, 12));
    } else {
      console.log("Não achou", nome);
    }
  }

  const { ensureBootstrapWorkspace } = await import("../src/lib/auth/workspace");
  const workspace = await ensureBootstrapWorkspace();
  const account = await prisma.salicAccount.findUniqueOrThrow({
    where: {
      workspaceId_cgccpf: { workspaceId: workspace.id, cgccpf: "20389940000121" },
    },
  });
  const project = await prisma.project.upsert({
    where: {
      salicAccountId_pronac: { salicAccountId: account.id, pronac: "153774" },
    },
    create: {
      salicAccountId: account.id,
      pronac: "153774",
      name: "Absurdus: Murilo Rubião 100 anos",
    },
    update: {},
  });

  let upserted = 0;
  for (const t of targets) {
    console.log("Buscando produtos", t.expect, t.id.slice(0, 12));
    try {
      const produtos = await listProdutosByFornecedor(t.id);
      const rows = produtos.filter((p) => String(p.PRONAC) === "153774");
      console.log(`  ${t.expect}: ${rows.length}/${produtos.length} no PRONAC`);
      for (const produto of rows) {
        const supplier = await upsertSupplier({
          cgccpf: produto.cgccpf,
          name: produto.nome_fornecedor,
          salicId: t.id,
        });
        await upsertPaymentFromProduto({
          projectId: project.id,
          supplierId: supplier.id,
          produto,
          source: "api",
        });
        upserted += 1;
      }
    } catch (e) {
      console.log("  falhou", t.expect, e instanceof Error ? e.message.slice(0, 120) : e);
    }
  }

  const payments = await prisma.payment.findMany({
    where: { projectId: project.id },
    include: { supplier: true },
  });
  const total = payments.reduce((s, p) => s + Number(p.amount), 0);
  console.log("\nResultado parcial:");
  console.log({ upserted, linhas: payments.length, total: total.toFixed(2), pdfTotal: "210661.61" });

  const samples = [
    { name: "EDITORA PULO", amount: 4410 },
    { name: "CAPSULA CULTURA", amount: 26068 },
    { name: "VIVAS CULTURA", amount: 30050 },
    { name: "VOLTZ DESIGN", amount: 10640 },
  ];
  for (const s of samples) {
    const hit = payments.find(
      (p) =>
        p.supplier.name.toUpperCase().includes(s.name) &&
        Math.abs(Number(p.amount) - s.amount) < 0.01,
    );
    console.log(hit ? `OK   ${s.name} R$ ${s.amount}` : `MISS ${s.name} R$ ${s.amount}`);
  }

  console.log("\nLinhas capturadas:");
  for (const p of payments.slice(0, 15)) {
    console.log(
      `${Number(p.amount).toFixed(2).padStart(10)} | ${(p.documentNumber || "").padEnd(8)} | ${p.supplier.name.slice(0, 35)} | ${p.itemName || ""}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
