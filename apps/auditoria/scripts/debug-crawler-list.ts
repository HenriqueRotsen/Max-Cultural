/**
 * Diagnóstico: login SALIC + dump da listagem de projetos (sem salvar senha).
 * Uso: npx tsx scripts/debug-crawler-list.ts
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/db";
import { decryptCredential } from "../src/lib/crypto";

const SALIC_BASE = "https://salic.cultura.gov.br";
const OUT = path.join(process.cwd(), ".salic-debug");

async function main() {
  await mkdir(OUT, { recursive: true });

  const account = await prisma.salicAccount.findFirst({
    where: { active: true, salicUsernameEnc: { not: null }, salicPasswordEnc: { not: null } },
  });
  if (!account?.salicUsernameEnc || !account.salicPasswordEnc) {
    throw new Error("Nenhuma conta com credenciais");
  }

  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) throw new Error("Nenhuma conta com credenciais");
  console.log("conta", account.name, "user", username);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const apiHits: Array<{ status: number; url: string; preview: string }> = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!/salic|cultura\.gov/i.test(url)) return;
    if (!/json|api|projeto|proponente|listar|pagamento/i.test(url)) return;
    let preview = "";
    try {
      const ct = response.headers()["content-type"] || "";
      if (ct.includes("json")) {
        const text = await response.text();
        preview = text.slice(0, 400).replace(/\s+/g, " ");
      }
    } catch {
      // ignore
    }
    apiHits.push({ status: response.status(), url: url.slice(0, 250), preview });
  });

  await page.goto(`${SALIC_BASE}/autenticacao/index/index`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.screenshot({ path: path.join(OUT, "01-login.png"), fullPage: true });

  const userSel = page.locator('input[name="Login"], input[name="login"], #Login, input[type="text"]').first();
  const passSel = page.locator('input[name="Senha"], input[name="senha"], #Senha, input[type="password"]').first();
  await userSel.fill(username);
  await passSel.fill(password);
  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Entrar")').first().click();
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "02-after-login.png"), fullPage: true });
  console.log("after login url", page.url());

  await page.goto(`${SALIC_BASE}/projeto/#/listar-projetos-proponente`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT, "03-listar-projetos.png"), fullPage: true });

  const dump = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
      href: a.getAttribute("href") || "",
      text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
    }));
    const tables = Array.from(document.querySelectorAll("table")).map((t, i) => ({
      i,
      rows: t.querySelectorAll("tr").length,
      text: (t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400),
    }));
    return {
      title: document.title,
      bodyLen: document.body?.innerText?.length || 0,
      bodyPreview: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1500),
      hashAnchors: anchors.filter((a) => a.href.includes("#/")),
      sampleAnchors: anchors.slice(0, 40),
      tables,
      appRoot: !!document.querySelector("#app, app-root, [ng-version], .ui-datatable, .p-datatable"),
    };
  });

  await writeFile(path.join(OUT, "list-dump.json"), JSON.stringify({ dump, apiHits }, null, 2));
  console.log("title", dump.title);
  console.log("bodyPreview", dump.bodyPreview.slice(0, 500));
  console.log("hashAnchors", dump.hashAnchors.length, dump.hashAnchors.slice(0, 10));
  console.log("tables", dump.tables);
  console.log("apiHits", apiHits.length);
  for (const h of apiHits.slice(0, 30)) {
    console.log(h.status, h.url);
    if (h.preview) console.log(" ", h.preview.slice(0, 200));
  }

  await browser.close();
  await prisma.$disconnect();
  console.log("wrote", OUT);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
