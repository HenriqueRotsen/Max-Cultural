import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

/**
 * Subir ao mudar o schema Prisma — força um client novo no processo.
 * Não encerra o pool antigo no hot reload (isso causa
 * "Cannot use a pool after calling end on the pool" no Next).
 */
const PRISMA_CLIENT_REV = 7;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
  prismaConnectionString: string | undefined;
  prismaClientRev: number | undefined;
};

function isPlaceholderUrl(url: string) {
  return url.includes("SEU_PROJECT_REF") || url.includes("SUA_SENHA");
}

function resolveDatabaseUrl() {
  // Next.js já carrega apps/fluxo/.env.local — não chamar dotenv aqui
  // (loga "injected env" e o overlay do Next bloqueia cliques).
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
  const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
  if (schema && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid Postgres schema name: ${schema}`);
  }
  const pool = new Pool({
    connectionString,
    ...(schema ? { options: `-c search_path=${schema},public` } : {}),
  });
  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return {
    client: new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    }),
    pool,
  };
}

function resolveClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl();
  const existing = globalForPrisma.prisma;
  if (
    existing &&
    globalForPrisma.prismaConnectionString === connectionString &&
    globalForPrisma.prismaClientRev === PRISMA_CLIENT_REV
  ) {
    return existing;
  }

  const { client, pool } = createPrismaClient(connectionString);
  globalForPrisma.prisma = client;
  globalForPrisma.pgPool = pool;
  globalForPrisma.prismaConnectionString = connectionString;
  globalForPrisma.prismaClientRev = PRISMA_CLIENT_REV;
  return client;
}

/**
 * Lazy: não exige DATABASE_URL no `next build`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (prop === "then") return undefined;
    const client = resolveClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
