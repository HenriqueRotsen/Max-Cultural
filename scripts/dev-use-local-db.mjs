#!/usr/bin/env node
/**
 * Aponta Cultural / Origem / Fluxo para Postgres local (dev) ou restaura o remoto.
 *
 *   node scripts/dev-use-local-db.mjs local
 *   node scripts/dev-use-local-db.mjs remote
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2];
if (mode !== "local" && mode !== "remote") {
  console.error("Uso: node scripts/dev-use-local-db.mjs <local|remote>");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");

const APPS = {
  cultural: {
    dir: resolve(root, "apps/cultural"),
    local: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5436/max_cultural",
      DIRECT_URL: "postgresql://postgres:postgres@localhost:5436/max_cultural",
      AUTH_COOKIE_DOMAIN: "",
      AUTH_2FA_DISABLED: "true",
      AUTH_EMAIL_SIMULATE: "true",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_ORIGEM_URL: "http://localhost:3001",
      NEXT_PUBLIC_FLUXO_URL: "http://localhost:3002",
      NEXT_PUBLIC_CULTURAL_URL: "http://localhost:3000",
      NEXT_PUBLIC_RECAPTCHA_ENABLED: "false",
      // Senha previsível só no Postgres local (backup remoto em .env.local.remote).
      BOOTSTRAP_ADMIN_PASSWORD: "LocalDemo123!",
      DEMO_PASSWORD: "LocalDemo123!",
    },
  },
  origem: {
    dir: resolve(root, "apps/origem"),
    local: {
      DATABASE_URL: "postgresql://salink:salink@localhost:5433/salink?schema=public",
      DIRECT_URL: "postgresql://salink:salink@localhost:5433/salink?schema=public",
      AUTH_COOKIE_DOMAIN: "",
      NEXT_PUBLIC_CULTURAL_URL: "http://localhost:3000",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
      NEXT_PUBLIC_FLUXO_URL: "http://localhost:3002",
      SALINK_DEV_OPEN: "0",
      SALINK_DEMO: "0",
    },
  },
  fluxo: {
    dir: resolve(root, "apps/fluxo"),
    local: {
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5436/max_cultural?schema=fluxo",
      DIRECT_URL:
        "postgresql://postgres:postgres@localhost:5436/max_cultural?schema=fluxo",
      AUTH_COOKIE_DOMAIN: "",
      AUTH_EMAIL_SIMULATE: "true",
      AUTH_2FA_DISABLED: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3002",
      NEXT_PUBLIC_CULTURAL_URL: "http://localhost:3000",
      BOOTSTRAP_ADMIN_EMAIL: "admin@maxcultural.local",
      BOOTSTRAP_ADMIN_PASSWORD: "LocalDemo123!",
    },
  },
};

function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, "m"));
  return m?.[1] ?? "";
}

function setKey(text, key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text.trimEnd()}\n${line}\n`;
}

function looksRemote(url) {
  return /supabase|pooler|aws-|vercel|neon\.tech|railway/i.test(url);
}

for (const [name, cfg] of Object.entries(APPS)) {
  const envPath = resolve(cfg.dir, ".env.local");
  const remotePath = resolve(cfg.dir, ".env.local.remote");
  if (!existsSync(envPath)) {
    console.warn(`⏭  ${name}: sem .env.local`);
    continue;
  }

  let text = readFileSync(envPath, "utf8");

  if (mode === "local") {
    const current = getKey(text, "DATABASE_URL");
    if (looksRemote(current) && !existsSync(remotePath)) {
      copyFileSync(envPath, remotePath);
      console.log(`💾 ${name}: backup → .env.local.remote`);
    }
    for (const [k, v] of Object.entries(cfg.local)) {
      text = setKey(text, k, v);
    }
    writeFileSync(envPath, text);
    console.log(`✅ ${name}: local (${cfg.local.DATABASE_URL.split("@")[1]})`);
  } else {
    if (!existsSync(remotePath)) {
      console.error(`❌ ${name}: falta .env.local.remote`);
      continue;
    }
    const remote = readFileSync(remotePath, "utf8");
    // Restaura chaves de conexão / SSO do backup, mantém o restante atual.
    for (const key of [
      "DATABASE_URL",
      "DIRECT_URL",
      "AUTH_COOKIE_DOMAIN",
      "AUTH_2FA_DISABLED",
      "AUTH_EMAIL_SIMULATE",
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_ORIGEM_URL",
      "NEXT_PUBLIC_FLUXO_URL",
      "NEXT_PUBLIC_CULTURAL_URL",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SALINK_DEV_OPEN",
      "SALINK_DEMO",
    ]) {
      const v = getKey(remote, key);
      if (v !== "") text = setKey(text, key, v);
    }
    writeFileSync(envPath, text);
    console.log(`✅ ${name}: remoto restaurado`);
  }
}

if (mode === "local") {
  console.log(`
Próximos passos:
  # bancos
  DOCKER_HOST=unix:///var/run/docker.sock docker compose -f apps/cultural/docker-compose.yml up -d
  DOCKER_HOST=unix:///var/run/docker.sock docker compose -f apps/origem/docker-compose.yml up -d

  # schema + demo
  npm run db:migrate:cultural && npm run db:seed:cultural
  npm run db:migrate:origem && npm run db:seed -w max-origem
  npm run db:migrate:fluxo && npm run db:seed-auth -w max-fluxo && npm run db:seed-demo -w max-fluxo

  unset DATABASE_URL DIRECT_URL
`);
}
