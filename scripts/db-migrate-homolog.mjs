#!/usr/bin/env node
/**
 * Aplica as migrações de todos os apps no banco de HOMOLOGAÇÃO.
 *
 *   npm run db:migrate:homolog            # aplica
 *   npm run db:migrate:homolog -- status  # só mostra o status
 *
 * Lê `.env.homolog` (raiz do repo, ignorado pelo git) e usa os
 * `prisma.homolog.config.ts` de cada app, que NÃO carregam `.env.local`
 * (o `.env.local` aponta para a produção e o `prisma.config.ts` padrão o
 * carrega por cima de tudo).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envFile = resolve(root, ".env.homolog");
const mode = process.argv[2] === "status" ? "status" : "deploy";

if (!existsSync(envFile)) {
  console.error("❌ Falta .env.homolog na raiz do repositório.");
  process.exit(1);
}

function readEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !line.startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

/** Conexão direta (Session pooler :5432), com a senha codificada para URL. */
function directUrl(raw) {
  const m = raw.match(/^(postgres(?:ql)?):\/\/([^:]+):(.*)@([^@/]+)\/([^?]*)/);
  if (!m) throw new Error("DIRECT_URL inválida em .env.homolog");
  const [, , user, pass, host, db] = m;
  const hostname = host.split(":")[0];
  const encoded = encodeURIComponent(decodeURIComponent(pass));
  return `postgresql://${user}:${encoded}@${hostname}:5432/${db || "postgres"}`;
}

const env = readEnv(readFileSync(envFile, "utf8"));
if (!env.DIRECT_URL) {
  console.error("❌ DIRECT_URL vazia em .env.homolog.");
  process.exit(1);
}
const base = directUrl(env.DIRECT_URL);
if (/aws-0-sa-east-1|db\.maogvvcvrgokfcpjqksv/.test(base)) {
  // Trava: o host da produção nunca deve aparecer aqui.
  console.error("❌ .env.homolog aponta para o banco de produção. Abortado.");
  process.exit(1);
}

// Auditoria não tem migrações próprias: o Financeiro é o dono (schemas financeiro + auditoria).
const apps = [
  { app: "cultural", url: base },
  { app: "financeiro", url: `${base}?schema=financeiro` },
  { app: "indicadores", url: `${base}?schema=indicadores` },
];

for (const { app, url } of apps) {
  console.log(`\n▶ ${app} (${mode})`);
  execFileSync(
    "npx",
    ["prisma", "migrate", mode, "--config", "prisma.homolog.config.ts"],
    {
      cwd: resolve(root, "apps", app),
      stdio: "inherit",
      env: { ...process.env, HOMOLOG_URL: url, DATABASE_URL: "", DIRECT_URL: "" },
    },
  );
}
console.log("\n✅ Homologação em dia.");
