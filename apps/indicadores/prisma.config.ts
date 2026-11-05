import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// .env.local manda no dev — sobrescreve DATABASE_URL exportada no shell (ex.: Supabase).
// MAX_LOCAL_STACK=1 (npm run dev:local): o ambiente local já vem no processo.
if (process.env.MAX_LOCAL_STACK !== "1") config({ path: ".env.local", override: true });

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
