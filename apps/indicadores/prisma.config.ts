import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// .env.local manda no dev — sobrescreve DATABASE_URL exportada no shell (ex.: Supabase).
config({ path: ".env.local", override: true });

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
