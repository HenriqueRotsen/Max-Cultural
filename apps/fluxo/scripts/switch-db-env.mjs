#!/usr/bin/env node
/**
 * Alterna DATABASE_URL / DIRECT_URL em .env.local entre Postgres local e remoto.
 *
 *   npm run db:use-local
 *   npm run db:use-remote
 *
 * Backup do remoto: .env.local.remote (criado na 1ª troca para local).
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2];
if (mode !== "local" && mode !== "remote") {
  console.error("Uso: node scripts/switch-db-env.mjs <local|remote>");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.local");
const remotePath = resolve(root, ".env.local.remote");
const dockerPath = resolve(root, ".env.local.docker");

const LOCAL_URL =
  "postgresql://postgres:postgres@localhost:5436/max_cultural?schema=fluxo";

if (!existsSync(envPath)) {
  console.error("Falta apps/fluxo/.env.local");
  process.exit(1);
}

function setKey(text, key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text.trimEnd()}\n${line}\n`;
}

function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, "m"));
  return m?.[1] ?? "";
}

let text = readFileSync(envPath, "utf8");

if (mode === "local") {
  const currentDb = getKey(text, "DATABASE_URL");
  if (currentDb.includes("supabase") || currentDb.includes("pooler")) {
    if (!existsSync(remotePath)) {
      copyFileSync(envPath, remotePath);
      console.log("Backup remoto → .env.local.remote");
    }
  }
  text = setKey(text, "DATABASE_URL", LOCAL_URL);
  text = setKey(text, "DIRECT_URL", LOCAL_URL);
  text = setKey(text, "AUTH_EMAIL_SIMULATE", "true");
  writeFileSync(envPath, text);
  if (!existsSync(dockerPath)) {
    writeFileSync(
      dockerPath,
      `DATABASE_URL="${LOCAL_URL}"\nDIRECT_URL="${LOCAL_URL}"\n`,
    );
  }
  console.log("Dev apontando para Postgres local (localhost:5436, schema fluxo).");
  console.log("Suba o banco: npm run db:local:up");
  console.log("Aplique schema: npx prisma db push && npm run db:seed-auth");
} else {
  if (!existsSync(remotePath)) {
    console.error("Não há .env.local.remote (backup do Supabase).");
    process.exit(1);
  }
  const remote = readFileSync(remotePath, "utf8");
  const db = getKey(remote, "DATABASE_URL");
  const direct = getKey(remote, "DIRECT_URL") || db;
  if (!db) {
    console.error(".env.local.remote sem DATABASE_URL");
    process.exit(1);
  }
  text = setKey(text, "DATABASE_URL", db);
  text = setKey(text, "DIRECT_URL", direct);
  writeFileSync(envPath, text);
  console.log("Dev apontando para o banco remoto (.env.local.remote).");
}
