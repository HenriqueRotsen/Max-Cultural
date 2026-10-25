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
      "[origem] DATABASE_URL aponta para Supabase em desenvolvimento. Rode: npm run db:use-local",
    );
  }
  const schema = schemaFromDatabaseUrl(connectionString);
  if (schema && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid Postgres schema name: ${schema}`);
  }
  // O adapter só qualifica SQL gerado pelo Prisma. $queryRaw / $executeRaw
  // precisam do search_path — sem isso, tabelas do schema (ex.: origem.catalog_*)
  // falham com "relation does not exist" e quebram /fornecedores.
  const pool = new Pool({
    connectionString,
    ...(schema ? { options: `-c search_path=auditoria,${schema},public` } : {}),
  });
  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

/** Detecta client gerado antes de uma mudança de schema (DMMF antigo em `next dev`). */
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
  // Planejamento e Fornecedores são do MAX Origem — não existem neste client.
  if (models.PlanningProject || models.CatalogSupplier) return false;
  const account = fields("SalicAccount");
  if (!account.has("foundedAt") || !account.has("institutionalMap")) return false;
  if (fields("Supplier").has("foundedAt")) return false;
  const project = fields("Project");
  if (!project.has("situacao") || !project.has("lifecycleStatus")) return false;
  for (const model of [
    "Payment",
    "SyncRun",
    "WatchedSupplier",
    "ObservadoBond",
    "CorporatePeriod",
    "CorporatePeriodMember",
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
