import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// .env.local manda no dev — sobrescreve DATABASE_URL exportada no shell.
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    ...(process.env["DIRECT_URL"]
      ? { directUrl: process.env["DIRECT_URL"] }
      : {}),
  },
});
