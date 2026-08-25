import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: number | undefined;
};

/** Bump quando o schema ganhar models/campos novos (evita client stale no next dev). */
const PRISMA_SCHEMA_VERSION = 27;

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

/** Detecta DMMF antigo após migrações do mapa. */
function clientMatchesSchema(client: PrismaClient): boolean {
  const models = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: Array<{ name: string }> }>;
      };
    }
  )._runtimeDataModel?.models;
  if (!models?.Supplier || !models?.SalicAccount) return false;
  const supplierFields = (models.Supplier.fields || []).map((f) => f.name);
  const accountFields = (models.SalicAccount.fields || []).map((f) => f.name);
  if (supplierFields.includes("foundedAt")) return false;
  if (!accountFields.includes("foundedAt")) return false;
  if (!accountFields.includes("institutionalMap")) return false;
  if (!models.CorporatePeriod) return false;
  if (!models.CorporatePeriodMember) return false;
  if (!models.ObservadoBond) return false;
  if (!models.CatalogSupplier) return false;
  const catalogFields = (models.CatalogSupplier.fields || []).map((f) => f.name);
  if (!catalogFields.includes("fromAudit")) return false;
  if (!catalogFields.includes("latitude")) return false;
  if (!models.CatalogService) return false;
  const serviceFields = (models.CatalogService.fields || []).map((f) => f.name);
  if (!serviceFields.includes("embeddingUpdatedAt")) return false;
  if (!models.CatalogEngagement) return false;
  const engagementFields = (models.CatalogEngagement.fields || []).map((f) => f.name);
  if (!engagementFields.includes("salicPaymentId")) return false;
  if (!engagementFields.includes("planningProjectId")) return false;
  if (!models.PlanningProject) return false;
  if (!models.ProjectBudgetSheet || !models.ProjectBudgetLine) return false;
  const budgetLineFields = (models.ProjectBudgetLine.fields || []).map((f) => f.name);
  if (!budgetLineFields.includes("homologatedAmount")) return false;
  if (!models.RubricCommitment) return false;
  if (!models.PlanningDocument) return false;
  if (!models.AppNotification) return false;
  if (models.PlanProposal || models.PlanBudgetStage) return false;
  const projectFields = (models.Project.fields || []).map((f) => f.name);
  if (!projectFields.includes("situacao")) return false;
  if (!projectFields.includes("lifecycleStatus")) return false;
  const planningFields = (models.PlanningProject.fields || []).map((f) => f.name);
  if (!planningFields.includes("lifecycleStatus")) return false;
  if (!planningFields.includes("salicPublishStatus")) return false;
  return true;
}

function getClient(): PrismaClient {
  const stale =
    !globalForPrisma.prisma ||
    globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION ||
    typeof (globalForPrisma.prisma as { workspace?: unknown }).workspace ===
      "undefined" ||
    !clientMatchesSchema(globalForPrisma.prisma);

  if (stale) {
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  }

  return globalForPrisma.prisma!;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
