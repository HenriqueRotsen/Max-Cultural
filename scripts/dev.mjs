#!/usr/bin/env node
/**
 * Os dois jeitos de rodar o MAX localmente (nunca no banco de produção):
 *
 *   npm run dev                      # homologação: banco de homologação (.env.homolog)
 *   npm run dev:teste                # teste: Postgres local com dados demo (.env.teste)
 *
 * Os dois sobem os 4 apps: Cultural :3000 (login), Financeiro :3001,
 * Indicadores :3002, Auditoria :3003. Para subir só alguns (o Cultural sempre
 * vem junto, porque é o login):  npm run dev -- indicadores
 *
 * Só no teste:
 *   npm run dev:teste -- setup       # cria/atualiza o banco local, contas e dados demo
 *   npm run dev:teste -- reset       # apaga o banco local e roda o setup de novo
 *   npm run dev:teste -- liberar     # simula "recurso liberado" em todos os projetos
 *
 * Rodar um comando de um app num dos ambientes (ex.: criar uma migração):
 *   npm run dev:teste -- run financeiro npx prisma migrate dev --name minha_mudanca
 *
 * Segurança: as variáveis dos `.env.local` (produção) são todas zeradas no
 * processo, MAX_AMBIENTE impede que o Prisma e os seeds recarreguem o
 * `.env.local`, e o script aborta se qualquer valor apontar para a produção
 * (e, no teste, para fora do localhost). Os apps também se recusam a abrir o
 * banco de produção fora da Vercel (`bloquearProducao`).
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const PRODUCAO = /maogvvcvrgokfcpjqksv/;
const PG = "postgresql://postgres:postgres@localhost:5436";
const DB = "max_local";

const APPS = {
  cultural: { port: 3000, schema: null, extra: [] },
  financeiro: { port: 3001, schema: "financeiro", extra: [] },
  indicadores: { port: 3002, schema: "indicadores", extra: ["--webpack"] },
  // A Auditoria lê as tabelas do schema financeiro (as migrações são do Financeiro).
  auditoria: { port: 3003, schema: "financeiro", extra: [] },
};

const [modo, ...args] = process.argv.slice(2);
if (modo !== "homolog" && modo !== "teste") {
  console.error("Uso: npm run dev  |  npm run dev:teste [-- setup|reset|liberar]");
  process.exit(1);
}
const comando = ["setup", "reset", "liberar", "run"].includes(args[0]) ? args.shift() : "start";

function falhar(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function readEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

function novosSegredos() {
  return {
    AUTH_SECRET: randomBytes(32).toString("hex"),
    CREDENTIALS_SECRET: randomBytes(32).toString("hex"),
  };
}

/** `.env.teste`: senha das contas locais e segredos. Criado na primeira vez. */
function ambienteTeste() {
  const arquivo = resolve(root, ".env.teste");
  const antigo = resolve(root, ".env.dev-local");
  if (!existsSync(arquivo) && existsSync(antigo)) {
    renameSync(antigo, arquivo);
    console.log("🔁 .env.dev-local renomeado para .env.teste.");
  }
  if (existsSync(arquivo) && /^DEV_LOCAL_PASSWORD=/m.test(readFileSync(arquivo, "utf8"))) {
    const texto = readFileSync(arquivo, "utf8")
      .replace(/^DEV_LOCAL_PASSWORD=/m, "TESTE_PASSWORD=")
      .replace(/npm run dev:local/g, "npm run dev:teste");
    writeFileSync(arquivo, texto, { mode: 0o600 });
  }
  const atual = readEnv(arquivo);
  if (atual.TESTE_PASSWORD && atual.AUTH_SECRET && atual.CREDENTIALS_SECRET) return atual;
  const novo = { TESTE_PASSWORD: `Local-${randomBytes(6).toString("hex")}!`, ...novosSegredos() };
  writeFileSync(
    arquivo,
    [
      "# npm run dev:teste: Postgres local. Ignorado pelo git.",
      "# Login: admin@maxcultural.local (também operador@ e professor@maxcultural.local), senha abaixo.",
      ...Object.entries(novo).map(([k, v]) => `${k}="${v}"`),
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.log("🔑 Criado .env.teste com a senha local e os segredos.");
  return novo;
}

/** `.env.homolog`: credenciais do banco de homologação (já existe; ganha segredos locais se faltarem). */
function ambienteHomolog() {
  const arquivo = resolve(root, ".env.homolog");
  if (!existsSync(arquivo)) falhar("Falta .env.homolog na raiz do repositório (credenciais do banco de homologação).");
  const atual = readEnv(arquivo);
  if (!atual.DIRECT_URL) falhar("DIRECT_URL vazia em .env.homolog.");
  if (Object.values(atual).some((v) => PRODUCAO.test(v))) falhar(".env.homolog aponta para a produção. Abortado.");
  if (!atual.AUTH_SECRET || !atual.CREDENTIALS_SECRET) {
    const novo = novosSegredos();
    const faltam = Object.entries(novo).filter(([k]) => !atual[k]);
    appendFileSync(
      arquivo,
      ["", "# Segredos para rodar a homologação localmente (npm run dev).", ...faltam.map(([k, v]) => `${k}="${v}"`), ""].join("\n"),
    );
    Object.assign(atual, Object.fromEntries(faltam));
    console.log("🔑 .env.homolog ganhou AUTH_SECRET/CREDENTIALS_SECRET para o uso local.");
  }
  return atual;
}

/** Conexão pelo Session pooler (:5432, IPv4), com a senha codificada para URL. */
function poolerHomolog(raw) {
  const m = raw.match(/^(postgres(?:ql)?):\/\/([^:]+):(.*)@([^@/]+)\/([^?]*)/);
  if (!m) falhar("DIRECT_URL inválida em .env.homolog");
  const [, , user, pass, host, db] = m;
  const encoded = encodeURIComponent(decodeURIComponent(pass));
  return `postgresql://${user}:${encoded}@${host.split(":")[0]}:5432/${db || "postgres"}`;
}

const s = modo === "teste" ? ambienteTeste() : ambienteHomolog();
const baseDb = modo === "teste" ? `${PG}/${DB}` : poolerHomolog(s.DIRECT_URL);

/** Variáveis de um app: tudo do `.env.local` (produção) zerado, mais as do ambiente. */
function envDoApp(app) {
  const prod = readEnv(resolve(root, "apps", app, ".env.local"));
  const zerado = Object.fromEntries(Object.keys(prod).map((k) => [k, ""]));
  // Valores inofensivos que podem continuar vindo do .env.local.
  for (const k of ["NEXT_PUBLIC_APP_NAME", "NEXT_PUBLIC_HIDE_INDICADORES_IAM"]) {
    if (prod[k]) zerado[k] = prod[k];
  }
  const { schema, port } = APPS[app];
  const db = schema ? `${baseDb}${baseDb.includes("?") ? "&" : "?"}schema=${schema}` : baseDb;
  const env = {
    ...process.env,
    ...zerado,
    MAX_AMBIENTE: modo,
    DATABASE_URL: db,
    DIRECT_URL: db,
    AUTH_SECRET: s.AUTH_SECRET,
    CREDENTIALS_SECRET: s.CREDENTIALS_SECRET,
    // Rotinas diárias (/api/cron/*) chamadas à mão: Authorization: Bearer <AUTH_SECRET>.
    CRON_SECRET: s.AUTH_SECRET,
    AUTH_COOKIE_DOMAIN: "",
    AUTH_2FA_DISABLED: "true",
    AUTH_EMAIL_SIMULATE: "true",
    NEXT_PUBLIC_RECAPTCHA_ENABLED: "false",
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_APP_URL: `http://localhost:${APPS.indicadores.port}`,
    NEXT_PUBLIC_CULTURAL_URL: `http://localhost:${APPS.cultural.port}`,
    NEXT_PUBLIC_FINANCEIRO_URL: `http://localhost:${APPS.financeiro.port}`,
    NEXT_PUBLIC_INDICADORES_URL: `http://localhost:${APPS.indicadores.port}`,
    NEXT_PUBLIC_AUDITORIA_URL: `http://localhost:${APPS.auditoria.port}`,
  };
  if (modo === "teste") {
    Object.assign(env, {
      BOOTSTRAP_ADMIN_EMAIL: "admin@maxcultural.local",
      BOOTSTRAP_ADMIN_PASSWORD: s.TESTE_PASSWORD,
      BOOTSTRAP_ADMIN_RESET: "true",
      DEMO_PASSWORD: s.TESTE_PASSWORD,
    });
  } else {
    // Supabase (storage etc.) da homologação. As contas de login são as da própria homologação.
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      if (s[k]) env[k] = s[k];
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (!(k in zerado) && !k.startsWith("NEXT_PUBLIC_") && !/URL$|KEY$|SECRET$/.test(k)) continue;
    if (PRODUCAO.test(String(v))) falhar(`${app}: ${k} aponta para a produção. Abortado.`);
    if (modo === "teste" && /supabase|pooler|vercel\.app|maxcultural\.com\.br|upstash|resend/i.test(String(v))) {
      falhar(`${app}: ${k} aponta para fora do localhost. Abortado.`);
    }
  }
  return env;
}

function run(app, cmdArgs) {
  execFileSync("npx", cmdArgs, { cwd: resolve(root, "apps", app), stdio: "inherit", env: envDoApp(app) });
}

async function postgresLocal() {
  const tentar = async () => {
    const c = new pg.Client({ connectionString: `${PG}/postgres` });
    try {
      await c.connect();
      await c.end();
      return true;
    } catch {
      return false;
    }
  };
  if (await tentar()) return;
  console.log("🐘 Subindo o Postgres local (docker compose)…");
  try {
    execFileSync("docker", ["compose", "-f", "apps/cultural/docker-compose.yml", "up", "-d", "postgres"], {
      cwd: root,
      stdio: "inherit",
      env: { DOCKER_HOST: "unix:///var/run/docker.sock", ...process.env },
    });
  } catch {
    falhar("Não consegui subir o Postgres local (localhost:5436). O Docker está rodando?");
  }
  for (let i = 0; i < 30; i++) {
    if (await tentar()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  falhar("Postgres local não responde em localhost:5436.");
}

async function comBanco(dbName, fn) {
  const c = new pg.Client({ connectionString: `${PG}/${dbName}` });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function setup({ reset }) {
  await postgresLocal();
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
  // Bancos criados antes de o Financeiro entrar no teste tinham só uma tabela improvisada dele.
  await comBanco(DB, async (c) => {
    const { rowCount } = await c.query("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'");
    if (!rowCount) {
      falhar(
        "O Postgres local não tem a extensão vector (o Financeiro precisa). Recrie o container com a imagem nova:\n" +
          "   docker compose -f apps/cultural/docker-compose.yml up -d postgres\n" +
          "   npm run dev:teste -- reset",
      );
    }
    const { rows } = await c.query(`SELECT
      to_regclass('financeiro.planning_projects') IS NOT NULL AS tabela,
      to_regclass('financeiro._prisma_migrations') IS NOT NULL AS migracoes`);
    if (rows[0].tabela && !rows[0].migracoes) {
      await c.query("DROP SCHEMA financeiro CASCADE");
      console.log("🧹 Schema financeiro improvisado removido (agora vem das migrações do Financeiro).");
    }
  });
  for (const app of ["cultural", "financeiro", "indicadores"]) {
    console.log(`\n▶ Migrações: ${app}`);
    run(app, ["prisma", "migrate", "deploy"]);
  }
  console.log("\n▶ Cliente do banco (prisma generate)");
  for (const app of Object.keys(APPS)) run(app, ["prisma", "generate"]);
  console.log("\n▶ Contas e dados demo");
  run("cultural", ["tsx", "scripts/seed.ts"]);
  run("financeiro", ["tsx", "scripts/seed.ts"]);
  run("indicadores", ["tsx", "scripts/seed-auth.ts"]);
  run("indicadores", ["tsx", "scripts/seed-demo.ts"]);
  await projetosDoFinanceiro();
  console.log("\n✅ Banco de teste pronto. Suba (ou reinicie) com: npm run dev:teste");
}

/**
 * Projetos do Planejamento que o acompanhamento do Indicadores lê (captado
 * transferido): federais (PRONAC) e de outras leis (código próprio).
 */
async function projetosDoFinanceiro() {
  await comBanco(DB, async (c) => {
    const { rows } = await c.query(
      `SELECT a.id AS account, a."workspaceId" AS workspace FROM financeiro."SalicAccount" a ORDER BY a."createdAt" LIMIT 1`,
    );
    if (!rows.length) return;
    const { account, workspace } = rows[0];
    await c.query(
      `INSERT INTO financeiro.planning_projects
        (id, "workspaceId", "accountId", name, "externalCode", jurisdiction, "valorCaptado", "captadoTransferido", "updatedAt")
      VALUES
        ('fin-demo-240001', $1, $2, 'Arte em Rede — Edição Demo', '240001', 'FEDERAL', 120000, 50000, now()),
        ('fin-demo-250010', $1, $2, 'Mostra Cultural Demo', '250010', 'FEDERAL', 80000, 0, now()),
        ('fin-demo-mg-001', $1, $2, 'Circuito Cultural Mineiro (lei estadual)', 'MG-2026-001', 'MG', 60000, 30000, now()),
        ('fin-demo-mg-002', $1, $2, 'Festival de Bairro (lei municipal)', 'BH-2026-002', 'MG', 40000, 0, now())
      ON CONFLICT (id) DO NOTHING`,
      [workspace, account],
    );
  });
  console.log("🏦 Financeiro: 4 projetos de exemplo no Planejamento.");
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
  const pedidos = args.length ? args : Object.keys(APPS);
  for (const a of pedidos) if (!APPS[a]) falhar(`App desconhecido: ${a}. Use: ${Object.keys(APPS).join(", ")}`);
  const apps = Object.keys(APPS).filter((a) => a === "cultural" || pedidos.includes(a));
  for (const app of apps) {
    const { port } = APPS[app];
    if (!(await portaLivre(port))) {
      falhar(`A porta ${port} (${app}) já está em uso. Feche o outro servidor (lsof -i :${port}) e rode de novo.`);
    }
  }
  if (modo === "teste") await postgresLocal();
  const procs = apps.map((app) => {
    const { port, extra } = APPS[app];
    const p = spawn("npx", ["next", "dev", "--port", String(port), ...extra], {
      cwd: resolve(root, "apps", app),
      env: envDoApp(app),
      stdio: ["ignore", "pipe", "pipe"],
      // Grupo próprio: ao encerrar, o grupo inteiro (npx + next-server) cai junto.
      detached: true,
    });
    for (const stream of [p.stdout, p.stderr]) {
      stream.on("data", (d) => process.stdout.write(String(d).replace(/^(?=.)/gm, `[${app}] `)));
    }
    p.on("exit", (code) => code && console.log(`[${app}] saiu com código ${code}`));
    return p;
  });
  const nome = modo === "teste" ? "TESTE (banco local)" : "HOMOLOGAÇÃO (banco de homologação)";
  console.log(`\n🚀 ${nome}`);
  for (const app of apps) console.log(`   ${app.padEnd(12)} http://localhost:${APPS[app].port}`);
  console.log(
    modo === "teste"
      ? "   Login: admin@maxcultural.local, senha TESTE_PASSWORD em .env.teste. Ctrl+C encerra.\n"
      : "   Login: as contas da homologação. Ctrl+C encerra.\n",
  );
  const parar = () => {
    for (const p of procs) {
      try {
        process.kill(-p.pid, "SIGTERM");
      } catch {
        // já saiu
      }
    }
    process.exit(0);
  };
  process.on("SIGINT", parar);
  process.on("SIGTERM", parar);
}

if (comando === "start") await start();
else if (comando === "run") {
  const [app, ...cmd] = args;
  if (!APPS[app] || !cmd.length) falhar(`Uso: npm run dev${modo === "teste" ? ":teste" : ""} -- run <app> <comando…>`);
  if (cmd[0] === "npx") cmd.shift();
  run(app, cmd);
} else if (modo !== "teste") falhar(`"${comando}" só existe no teste: npm run dev:teste -- ${comando}`);
else if (comando === "setup") await setup({ reset: false });
else if (comando === "reset") await setup({ reset: true });
else if (comando === "liberar") await liberar();
