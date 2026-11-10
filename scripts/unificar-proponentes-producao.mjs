#!/usr/bin/env node
/**
 * MAX Indicadores: une grafias do mesmo proponente no banco de PRODUÇÃO (a main).
 * Só com autorização. Roda apps/indicadores/scripts/unificar-proponentes.ts.
 *
 *   npm run indicadores:unificar-proponentes:producao                # dry-run: só mostra o que faria
 *   npm run indicadores:unificar-proponentes:producao -- --aplicar   # grava, depois de digitar "producao"
 *
 * A credencial vem de apps/indicadores/.env.local (fora do git). Ao aplicar, um
 * backup JSON (id, nome antigo, nome novo) fica em apps/indicadores/backups/.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const root = resolve(import.meta.dirname, "..");
const PRODUCAO = /maogvvcvrgokfcpjqksv/;
const aplicar = process.argv.includes("--aplicar");

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
function directUrl(raw) {
  const m = raw.match(/^(postgres(?:ql)?):\/\/([^:]+):(.*)@([^@/]+)\/([^?]*)/);
  if (!m) falhar("DIRECT_URL inválida em apps/indicadores/.env.local");
  const [, , user, pass, host, db] = m;
  const encoded = encodeURIComponent(decodeURIComponent(pass));
  return `postgresql://${user}:${encoded}@${host.split(":")[0]}:5432/${db || "postgres"}?schema=indicadores`;
}

const env = readEnv(resolve(root, "apps", "indicadores", ".env.local"));
if (!env.DIRECT_URL) falhar("Falta DIRECT_URL da produção em apps/indicadores/.env.local.");
const url = directUrl(env.DIRECT_URL);
if (!PRODUCAO.test(url)) falhar("apps/indicadores/.env.local não aponta para a produção. Abortado.");

if (aplicar) {
  console.log("⚠️  Isto ALTERA proponentes de projetos e inscrições no banco de PRODUÇÃO (só com autorização).");
  console.log("   Rode antes sem --aplicar e confira a lista.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await rl.question('Digite "producao" para continuar: ');
  rl.close();
  if (resposta.trim() !== "producao") falhar("Cancelado.");
}

execFileSync("npx", ["tsx", "scripts/unificar-proponentes.ts", ...(aplicar ? ["--aplicar"] : [])], {
  cwd: resolve(root, "apps", "indicadores"),
  stdio: "inherit",
  env: { ...process.env, MAX_AMBIENTE: "producao", DATABASE_URL: url, DIRECT_URL: url },
});
