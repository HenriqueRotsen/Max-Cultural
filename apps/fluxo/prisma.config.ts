import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Pooler (app) — fallback para DATABASE_URL
    url: process.env["DATABASE_URL"],
    // Direta (migrate) — se não houver DIRECT_URL, usa DATABASE_URL
    ...(process.env["DIRECT_URL"]
      ? { directUrl: process.env["DIRECT_URL"] }
      : {}),
  },
});
