#!/usr/bin/env node
/**
 * Aplica as migrações de todos os apps num banco remoto.
 *
 *   npm run db:migrate:homolog              # banco de homologação (.env.homolog)
 *   npm run db:migrate:homolog -- status    # só mostra o que falta
 *   npm run db:migrate:producao -- status   # produção: só mostra o que falta
 *   npm run db:migrate:producao             # produção: aplica, depois de digitar "producao"
 *
 * É o único caminho local que abre o banco de produção (MAX_AMBIENTE=producao).
 * As credenciais da produção vêm dos `.env.local` de cada app; as da
 * homologação, do `.env.homolog` na raiz. Os dois ficam fora do git.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const root = resolve(import.meta.dirname, "..");
const PRODUCAO = /maogvvcvrgokfcpjqksv/;
const alvo = process.argv[2];
const mode = process.argv[3] === "status" ? "status" : "deploy";
if (alvo !== "homolog" && alvo !== "producao") {
  console.error("Uso: node scripts/db-migrate.mjs <homolog|producao> [status]");
  process.exit(1);
}

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

/** Conexão direta pelo Session pooler (:5432), com a senha codificada para URL. */
function directUrl(raw, origem) {
  const m = raw.match(/^(postgres(?:ql)?):\/\/([^:]+):(.*)@([^@/]+)\/([^?]*)/);
  if (!m) falhar(`DIRECT_URL inválida em ${origem}`);
  const [, , user, pass, host, db] = m;
  const encoded = encodeURIComponent(decodeURIComponent(pass));
  return `postgresql://${user}:${encoded}@${host.split(":")[0]}:5432/${db || "postgres"}`;
}

const comSchema = (url, schema) => (schema ? `${url}?schema=${schema}` : url);

// A Auditoria não tem migrações próprias: o Financeiro é o dono (schemas financeiro + auditoria).
const APPS = [
  { app: "cultural", schema: null },
  { app: "financeiro", schema: "financeiro" },
  { app: "indicadores", schema: "indicadores" },
];

let urls;
if (alvo === "homolog") {
  const env = readEnv(resolve(root, ".env.homolog"));
  if (!env.DIRECT_URL) falhar("Falta DIRECT_URL em .env.homolog (raiz do repositório).");
  const base = directUrl(env.DIRECT_URL, ".env.homolog");
  if (PRODUCAO.test(base)) falhar(".env.homolog aponta para o banco de produção. Abortado.");
  urls = APPS.map(({ app, schema }) => ({ app, url: comSchema(base, schema) }));
} else {
  urls = APPS.map(({ app, schema }) => {
    const env = readEnv(resolve(root, "apps", app, ".env.local"));
    if (!env.DIRECT_URL) falhar(`Falta DIRECT_URL da produção em apps/${app}/.env.local.`);
    const url = comSchema(directUrl(env.DIRECT_URL, `apps/${app}/.env.local`), schema);
    if (!PRODUCAO.test(url)) falhar(`apps/${app}/.env.local não aponta para a produção. Abortado.`);
    return { app, url };
  });
  if (mode === "deploy") {
    console.log("⚠️  Isto aplica as migrações no banco de PRODUÇÃO (só com autorização, no merge para a main).");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = await rl.question('Digite "producao" para continuar: ');
    rl.close();
    if (resposta.trim() !== "producao") falhar("Cancelado.");
  }
}

for (const { app, url } of urls) {
  console.log(`\n▶ ${app} (${alvo}, ${mode})`);
  execFileSync("npx", ["prisma", "migrate", mode], {
    cwd: resolve(root, "apps", app),
    stdio: "inherit",
    env: { ...process.env, MAX_AMBIENTE: alvo, DATABASE_URL: url, DIRECT_URL: url },
  });
}
console.log(`\n✅ ${alvo === "homolog" ? "Homologação" : "Produção"} em dia.`);
