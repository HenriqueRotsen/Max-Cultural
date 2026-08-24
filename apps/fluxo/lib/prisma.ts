import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
  prismaConnectionString: string | undefined;
};

function isPlaceholderUrl(url: string) {
  return url.includes("SEU_PROJECT_REF") || url.includes("SUA_SENHA");
}

function resolveDatabaseUrl() {
  if (process.env.NODE_ENV !== "production") {
    config({ path: resolve(process.cwd(), ".env.local"), override: true });
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (isPlaceholderUrl(url)) {
    throw new Error(
      "DATABASE_URL ainda está com o placeholder do .env.example. Use o Postgres local em apps/fluxo/.env.local (localhost:5436, schema fluxo).",
    );
  }
  return url;
}

function createPrismaClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return {
    client: new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    }),
    pool,
  };
}

type RuntimeModel = {
  fields?: Array<{ name: string }>;
};

function clientHasCurrentSchema(client: PrismaClient): boolean {
  const c = client as unknown as {
    user?: unknown;
    _runtimeDataModel?: {
      models?: Record<string, RuntimeModel>;
    };
  };
  if (typeof c.user === "undefined") return false;
  const fields = c._runtimeDataModel?.models?.UserDataScope?.fields ?? [];
  return fields.some((f) => f.name === "access");
}

function resolveClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl();
  const existing = globalForPrisma.prisma;
  if (
    existing &&
    globalForPrisma.prismaConnectionString === connectionString &&
    clientHasCurrentSchema(existing)
  ) {
    return existing;
  }
  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }
  if (globalForPrisma.pgPool) {
    void globalForPrisma.pgPool.end().catch(() => undefined);
  }
  const { client, pool } = createPrismaClient(connectionString);
  globalForPrisma.prisma = client;
  globalForPrisma.pgPool = pool;
  globalForPrisma.prismaConnectionString = connectionString;
  return client;
}

/** Singleton sem Proxy externo (Proxy quebra delegates no Turbopack). */
export const prisma: PrismaClient = resolveClient();
