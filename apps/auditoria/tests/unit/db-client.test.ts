import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { clientMatchesSchema } from "@/lib/db";

describe("clientMatchesSchema", () => {
  // Se falhar, o app recria PrismaClient + Pool a cada acesso ao banco (vaza conexões).
  it("aceita o client gerado deste app", () => {
    const pool = new Pool({ connectionString: "postgresql://x:y@127.0.0.1:1/none" });
    const client = new PrismaClient({ adapter: new PrismaPg(pool) });
    expect(clientMatchesSchema(client)).toBe(true);
  });
});
