import "dotenv/config";
import { prisma } from "../src/lib/db";
import { listProdutosByFornecedor } from "../src/lib/salic/api";
import { upsertPaymentFromProduto, upsertSupplier } from "../src/lib/salic/persist";

async function main() {
  const { ensureBootstrapWorkspace } = await import("../src/lib/auth/workspace");
  const workspace = await ensureBootstrapWorkspace();

  const account = await prisma.salicAccount.upsert({
    where: {
      workspaceId_cgccpf: { workspaceId: workspace.id, cgccpf: "23693041000106" },
    },
    create: {
      name: "Conta demo smoke",
      cgccpf: "23693041000106",
      active: true,
      workspaceId: workspace.id,
    },
    update: { active: true },
  });

  const project = await prisma.project.upsert({
    where: {
      salicAccountId_pronac: { salicAccountId: account.id, pronac: "158630" },
    },
    create: {
      salicAccountId: account.id,
      pronac: "158630",
      name: "Projeto demo API",
      lastSyncedAt: new Date(),
    },
    update: { lastSyncedAt: new Date() },
  });

  // Fornecedor conhecido na documentação da API
  const fornecedorId = "da1e24a776b698b218234337757482b81818d7bffe4fc03e10fc13a25c56";
  const produtos = await listProdutosByFornecedor(fornecedorId);
  const forPronac = produtos.filter((p) => String(p.PRONAC) === "158630");

  let upserted = 0;
  for (const produto of forPronac.slice(0, 20)) {
    const supplier = await upsertSupplier({
      cgccpf: produto.cgccpf,
      name: produto.nome_fornecedor,
      salicId: fornecedorId,
    });
    await upsertPaymentFromProduto({
      projectId: project.id,
      supplierId: supplier.id,
      produto,
      source: "api",
    });
    upserted += 1;
  }

  await prisma.watchedSupplier.create({
    data: {
      label: "Inventor d Sonhos",
      cgccpf: "00000000000000",
      nameQuery: "Inventor",
      workspaceId: workspace.id,
    },
  }).catch(() => undefined);

  console.log({
    produtosTotal: produtos.length,
    forPronac: forPronac.length,
    upserted,
    payments: await prisma.payment.count(),
    suppliers: await prisma.supplier.count(),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
