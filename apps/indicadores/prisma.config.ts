import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { bloquearProducao } from "./lib/ambiente";

// Fora de `npm run dev` / `npm run dev:teste` (que definem MAX_AMBIENTE), vale o .env.local do app.
if (!process.env.MAX_AMBIENTE) config({ path: ".env.local", override: true });
bloquearProducao(process.env.DATABASE_URL, process.env.DIRECT_URL);

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
