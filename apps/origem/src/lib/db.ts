import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: number | undefined;
};

/** Bump quando o schema ganhar models/campos novos (evita client stale no next dev). */
const PRISMA_SCHEMA_VERSION = 19;

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
