#!/usr/bin/env node
/**
 * Ambiente local completo: MAX Cultural (login, :3000) + MAX Indicadores (:3002)
 * num Postgres local, sem tocar nos `.env.local` (que apontam para a produção).
 *
 *   npm run dev:local -- setup     # cria/atualiza o banco local, contas e dados demo
 *   npm run dev:local              # sobe o hub e o Indicadores
 *   npm run dev:local -- liberar   # simula "recurso liberado" em todos os projetos
 *   npm run dev:local -- reset     # apaga o banco local e roda o setup de novo
 *
 * Login: admin@maxcultural.local, com a senha de DEV_LOCAL_PASSWORD em `.env.dev-local`
 * (raiz do repo, ignorado pelo git, criado no primeiro setup).
 *
 * Segurança: todas as variáveis dos `.env.local` são zeradas no processo e
 * MAX_LOCAL_STACK=1 impede que o Prisma, os seeds e o hub recarreguem o
 * `.env.local`. O script aborta se qualquer valor apontar para fora do localhost.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const PG = "postgresql://postgres:postgres@localhost:5436";
const DB = "max_local";
const localFile = resolve(root, ".env.dev-local");
const cmd = process.argv[2] || "start";

function readEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

function segredosLocais() {
  const atual = readEnv(localFile);
  if (atual.DEV_LOCAL_PASSWORD && atual.AUTH_SECRET) return atual;
  const novo = {
    DEV_LOCAL_PASSWORD: `Local-${randomBytes(6).toString("hex")}!`,
    AUTH_SECRET: randomBytes(32).toString("hex"),
    CREDENTIALS_SECRET: randomBytes(32).toString("hex"),
  };
  writeFileSync(
    localFile,
    [
      "# Ambiente local (npm run dev:local). Só vale no Postgres local; não vai para o git.",
      "# Login: admin@maxcultural.local (também operador@ e professor@maxcultural.local)",
      ...Object.entries(novo).map(([k, v]) => `${k}="${v}"`),
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.log("🔑 Criado .env.dev-local com a senha local e os segredos.");
  return novo;
}

/** Variáveis de cada app: tudo do `.env.local` zerado, mais os valores locais. */
function envDoApp(app, s) {
  const prod = readEnv(resolve(root, "apps", app, ".env.local"));
  const zerado = Object.fromEntries(Object.keys(prod).map((k) => [k, ""]));
  // Valores inofensivos que podem continuar vindo do .env.local.
  for (const k of ["NEXT_PUBLIC_APP_NAME", "NEXT_PUBLIC_HIDE_INDICADORES_IAM"]) {
    if (prod[k]) zerado[k] = prod[k];
  }
  const db = app === "cultural" ? `${PG}/${DB}` : `${PG}/${DB}?schema=${app}`;
  const env = {
    ...process.env,
    ...zerado,
    MAX_LOCAL_STACK: "1",
    DATABASE_URL: db,
    DIRECT_URL: db,
    AUTH_SECRET: s.AUTH_SECRET,
    CREDENTIALS_SECRET: s.CREDENTIALS_SECRET,
    AUTH_COOKIE_DOMAIN: "",
    AUTH_2FA_DISABLED: "true",
    AUTH_EMAIL_SIMULATE: "true",
    BOOTSTRAP_ADMIN_EMAIL: "admin@maxcultural.local",
    BOOTSTRAP_ADMIN_PASSWORD: s.DEV_LOCAL_PASSWORD,
    BOOTSTRAP_ADMIN_RESET: "true",
    DEMO_PASSWORD: s.DEV_LOCAL_PASSWORD,
    NEXT_PUBLIC_RECAPTCHA_ENABLED: "false",
    NEXT_PUBLIC_CULTURAL_URL: "http://localhost:3000",
    NEXT_PUBLIC_SITE_URL: app === "cultural" ? "http://localhost:3000" : "http://localhost:3002",
    NEXT_PUBLIC_APP_URL: "http://localhost:3002",
    NEXT_PUBLIC_INDICADORES_URL: "http://localhost:3002",
    NEXT_PUBLIC_FINANCEIRO_URL: "http://localhost:3001",
    NEXT_PUBLIC_AUDITORIA_URL: "http://localhost:3003",
  };
  for (const [k, v] of Object.entries(env)) {
    if (k in zerado || k.startsWith("NEXT_PUBLIC_") || /URL$/.test(k)) {
      if (/supabase|pooler|vercel\.app|maxcultural\.com\.br|upstash|resend/i.test(String(v))) {
        console.error(`❌ ${app}: ${k} aponta para fora do localhost. Abortado.`);
        process.exit(1);
      }
    }
  }
  return env;
}

function run(app, args) {
  execFileSync("npx", args, { cwd: resolve(root, "apps", app), stdio: "inherit", env: envDoApp(app, segredosLocais()) });
}

async function comBanco(dbName, fn) {
  const c = new pg.Client({ connectionString: `${PG}/${dbName}` });
  try {
    await c.connect();
  } catch {
    console.error("❌ Postgres local não responde em localhost:5436. Rode: npm run db:local:up -w max-cultural-app");
    process.exit(1);
  }
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function setup({ reset }) {
  segredosLocais();
  await comBanco("postgres", async (c) => {
    if (reset) {
      await c.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
      console.log(`🗑  Banco ${DB} apagado.`);
    }
    const { rowCount } = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB]);
    if (!rowCount) {
      await c.query(`CREATE DATABASE ${DB}`);
      console.log(`🆕 Banco ${DB} criado.`);
    }
  });
  console.log("\n▶ Migrações do MAX Cultural");
  run("cultural", ["prisma", "migrate", "deploy"]);
  console.log("\n▶ Migrações do MAX Indicadores");
  run("indicadores", ["prisma", "migrate", "deploy"]);
  console.log("\n▶ Cliente do banco (prisma generate)");
  run("cultural", ["prisma", "generate"]);
  run("indicadores", ["prisma", "generate"]);
  console.log("\n▶ Contas locais");
  run("cultural", ["tsx", "scripts/seed.ts"]);
  run("indicadores", ["tsx", "scripts/seed-auth.ts"]);
  console.log("\n▶ Dados demo do Indicadores");
  run("indicadores", ["tsx", "scripts/seed-demo.ts"]);
  console.log("\n✅ Ambiente local pronto. Suba (ou reinicie) com: npm run dev:local");
}

async function liberar() {
  await comBanco(DB, async (c) => {
    const r = await c.query(`
      INSERT INTO indicadores.acompanhamentos (id, projeto_id, recurso_liberado_em, "updatedAt")
      SELECT gen_random_uuid()::text, p.id, now(), now() FROM indicadores.projetos p
      ON CONFLICT (projeto_id) DO UPDATE SET recurso_liberado_em = COALESCE(indicadores.acompanhamentos.recurso_liberado_em, now())`);
    console.log(`✅ Recurso liberado em ${r.rowCount} projeto(s) do banco local.`);
  });
}

function portaLivre(port) {
  return new Promise((ok) => {
    const srv = createServer()
      .once("error", () => ok(false))
      .once("listening", () => srv.close(() => ok(true)))
      .listen(port);
  });
}

async function start() {
  for (const port of [3000, 3002]) {
    if (!(await portaLivre(port))) {
      console.error(`❌ A porta ${port} já está em uso (o ambiente local já está aberto em outro terminal?).`);
      console.error(`   Para ver quem usa: lsof -i :${port}`);
      process.exit(1);
    }
  }
  const s = segredosLocais();
  const procs = [
    { app: "cultural", port: 3000, extra: [] },
    { app: "indicadores", port: 3002, extra: ["--webpack"] },
  ].map(({ app, port, extra }) => {
    const p = spawn("npx", ["next", "dev", "--port", String(port), ...extra], {
      cwd: resolve(root, "apps", app),
      env: envDoApp(app, s),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const tag = `[${app}]`;
    for (const stream of [p.stdout, p.stderr]) {
      stream.on("data", (d) =>
        process.stdout.write(String(d).replace(/^(?=.)/gm, `${tag} `)),
      );
    }
    return p;
  });
  console.log("🚀 MAX Cultural: http://localhost:3000  ·  MAX Indicadores: http://localhost:3002");
  console.log("   Login: admin@maxcultural.local (senha em .env.dev-local). Ctrl+C encerra.");
  const parar = () => {
    for (const p of procs) p.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", parar);
  process.on("SIGTERM", parar);
  for (const p of procs) p.on("exit", (code) => code && console.log(`processo saiu com código ${code}`));
}

if (cmd === "setup") await setup({ reset: false });
else if (cmd === "reset") await setup({ reset: true });
else if (cmd === "liberar") await liberar();
else if (cmd === "start") await start();
else {
  console.error("Uso: npm run dev:local [-- setup|reset|liberar]");
  process.exit(1);
}
