import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
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
  const existing = globalForPrisma.prisma;
  if (existing && clientHasCurrentSchema(existing)) {
    return existing;
  }
  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }
  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

/** Singleton sem Proxy externo (Proxy quebra delegates no Turbopack). */
export const prisma: PrismaClient = resolveClient();
