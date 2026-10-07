import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

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
      "[cultural] DATABASE_URL aponta para Supabase em desenvolvimento. Rode: npm run db:use-local",
    );
  }
  const schema = schemaFromDatabaseUrl(connectionString);
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/** Lazy: evita exigir DATABASE_URL no `next build` (ex.: preview Dependabot). */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
