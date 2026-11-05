// Migrações no banco de HOMOLOGAÇÃO: `npm run db:migrate:homolog` (raiz). Não lê .env.local,
// que aponta para a produção. A URL vem de .env.homolog via scripts/db-migrate-homolog.mjs.
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["HOMOLOG_URL"] },
});
