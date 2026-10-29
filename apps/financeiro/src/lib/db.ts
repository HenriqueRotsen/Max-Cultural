import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: number | undefined;
};

/** Bump quando o schema ganhar models/campos novos (evita client stale no next dev). */
const PRISMA_SCHEMA_VERSION = 39;

function schemaFromDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get("schema") ?? undefined;
  } catch {
    return undefined;
  }
}

function createPrismaClient() {
  if (process.env.NODE_ENV !== "production") {
    config({ path: resolve(process.cwd(), ".env.local"), override: true });
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (/supabase\.co|pooler\.supabase/i.test(connectionString)) {
    console.warn(
      "[financeiro] DATABASE_URL aponta para Supabase em desenvolvimento. Rode: npm run db:use-local",
    );
  }
  const schema = schemaFromDatabaseUrl(connectionString);
  if (schema && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid Postgres schema name: ${schema}`);
  }
  // O adapter só qualifica SQL gerado pelo Prisma. $queryRaw / $executeRaw
  // precisam do search_path — sem isso, tabelas do schema (ex.: financeiro.catalog_*)
  // falham com "relation does not exist" e quebram /fornecedores.
  const pool = new Pool({
    connectionString,
    ...(schema ? { options: `-c search_path=${schema},public` } : {}),
  });
  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

/** Detecta client gerado antes de uma migração (DMMF antigo em `next dev`). */
export function clientMatchesSchema(client: PrismaClient): boolean {
  const models = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: Array<{ name: string }> }>;
      };
    }
  )._runtimeDataModel?.models;
  if (!models) return false;
  const fields = (model: string) => new Set((models[model]?.fields || []).map((f) => f.name));
  // Tabelas da Auditoria (Project, Payment, Supplier…) vivem no app MAX Auditoria.
  if (models.Supplier || models.Project || models.Payment) return false;
  const account = fields("SalicAccount");
  if (!account.has("foundedAt") || !account.has("institutionalMap")) return false;
  const catalog = fields("CatalogSupplier");
  if (!catalog.has("latitude") || catalog.has("fromAudit")) return false;
  if (!fields("CatalogService").has("embeddingUpdatedAt")) return false;
  const engagement = fields("CatalogEngagement");
  if (!engagement.has("planningProjectId") || engagement.has("salicPaymentId")) return false;
  if (!fields("ProjectBudgetLine").has("homologatedAmount")) return false;
  if (!fields("RubricCommitment").has("pedidoId")) return false;
  const planning = fields("PlanningProject");
  if (!planning.has("salicPublishStatus") || !planning.has("situacao") || planning.has("projectId")) {
    return false;
  }
  for (const model of [
    "ProjectBudgetSheet",
    "PlanningPedido",
    "PlanningDocument",
    "AppNotification",
    "NotificationSettings",
    "AuditLog",
  ]) {
    if (!models[model]) return false;
  }
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
