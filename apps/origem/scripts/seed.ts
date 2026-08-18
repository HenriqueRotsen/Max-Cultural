import "dotenv/config";
import { prisma } from "../src/lib/db";
import { encryptCredential } from "../src/lib/crypto";

async function main() {
  await prisma.payment.deleteMany();
  await prisma.watchedSupplier.deleteMany();
  await prisma.relatedParty.deleteMany();
  await prisma.project.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.salicAccount.deleteMany();
  await prisma.normDocumentSnapshot.deleteMany();
  await prisma.complianceRuleset.deleteMany();

  const { ensureDefaultRuleset } = await import("../src/lib/compliance/rules");
  await ensureDefaultRuleset();

  const { ensureBootstrapWorkspace } = await import("../src/lib/auth/workspace");
  const workspace = await ensureBootstrapWorkspace();

  const a1 = await prisma.salicAccount.create({
    data: {
      name: "Proponente Alpha",
      cgccpf: "11111111000191",
      salicUsernameEnc: encryptCredential("alpha"),
      personType: "PJ",
      active: true,
      workspaceId: workspace.id,
    },
  });
  const a2 = await prisma.salicAccount.create({
    data: {
      name: "Proponente Beta",
      cgccpf: "22222222000172",
      personType: "PJ",
      active: true,
      workspaceId: workspace.id,
    },
  });

  const supplier = await prisma.supplier.create({
    data: {
      cgccpf: "33333333000153",
      name: "Fornecedor Exemplo LTDA",
      email: "contato@exemplo.com",
    },
  });

  const other = await prisma.supplier.create({
    data: {
      cgccpf: "44444444000134",
      name: "Servicos Culturais ME",
    },
  });

  const p1 = await prisma.project.create({
    data: {
      salicAccountId: a1.id,
      pronac: "240001",
      name: "Festival Alpha",
      lastSyncedAt: new Date(),
    },
  });
  const p2 = await prisma.project.create({
    data: {
      salicAccountId: a1.id,
      pronac: "240002",
      name: "Oficinas Alpha",
      lastSyncedAt: new Date(),
    },
  });
  const p3 = await prisma.project.create({
    data: {
      salicAccountId: a2.id,
      pronac: "250010",
      name: "Mostra Beta",
      lastSyncedAt: new Date(),
    },
  });

  await prisma.payment.createMany({
    data: [
      {
        source: "api",
        externalId: "demo-1",
        projectId: p1.id,
        supplierId: supplier.id,
        itemName: "Sonorização",
        documentType: "Nota Fiscal/Fatura",
        documentNumber: "1001",
        paymentDate: new Date("2024-03-10"),
        paymentMethod: "Transferencia Bancaria",
        amount: 15000,
      },
      {
        source: "api",
        externalId: "demo-2",
        projectId: p2.id,
        supplierId: supplier.id,
        itemName: "Iluminação",
        documentType: "Nota Fiscal/Fatura",
        documentNumber: "1002",
        paymentDate: new Date("2024-06-15"),
        paymentMethod: "Transferencia Bancaria",
        amount: 8200.5,
      },
      {
        source: "crawler",
        externalId: "demo-3",
        projectId: p3.id,
        supplierId: supplier.id,
        itemName: "Cenografia",
        documentType: "Nota Fiscal/Fatura",
        documentNumber: "2001",
        paymentDate: new Date("2025-01-20"),
        paymentMethod: "Transferencia Bancaria",
        amount: 4300,
      },
      {
        source: "api",
        externalId: "demo-4",
        projectId: p1.id,
        supplierId: other.id,
        itemName: "Assessoria de imprensa",
        documentType: "RPA",
        documentNumber: "55",
        paymentDate: new Date("2024-04-01"),
        amount: 3500,
      },
    ],
  });

  await prisma.watchedSupplier.create({
    data: {
      label: "Fornecedor Exemplo",
      cgccpf: supplier.cgccpf,
      supplierId: supplier.id,
      workspaceId: workspace.id,
    },
  });

  await prisma.syncRun.create({
    data: {
      status: "success",
      startedAt: new Date(Date.now() - 60_000),
      finishedAt: new Date(),
      projectsSynced: 3,
      paymentsUpserted: 4,
      salicAccountId: a1.id,
      log: "Seed local — dados de demonstração",
    },
  });

  console.log("Seed OK");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
