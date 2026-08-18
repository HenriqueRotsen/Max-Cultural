/**
 * Diagnóstico completo: CF → login → listar projetos + XHR.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/db";
import { decryptCredential } from "../src/lib/crypto";

const SALIC_BASE = "https://salic.cultura.gov.br";
const OUT = path.join(process.cwd(), ".salic-debug");

async function waitPastCloudflare(page: import("playwright").Page) {
  await page.waitForFunction(
    () => {
      const t = document.title || "";
      const body = document.body?.innerText || "";
      return !/just a moment/i.test(t) && !/enable javascript and cookies/i.test(body);
    },
    { timeout: 90_000 },
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const account = await prisma.salicAccount.findFirst({
    where: { active: true, salicUsernameEnc: { not: null }, salicPasswordEnc: { not: null } },
  });
  if (!account?.salicUsernameEnc || !account.salicPasswordEnc) throw new Error("Sem credenciais");
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) throw new Error("Sem credenciais");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "pt-BR",
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  const apiHits: Array<{ status: number; url: string; preview: string }> = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!/salic\.cultura|cultura\.gov/i.test(url)) return;
    const interesting =
      /api|projeto|proponente|listar|pagamento|json|rest|ajax/i.test(url) ||
      (response.headers()["content-type"] || "").includes("json");
    if (!interesting) return;
    let preview = "";
    try {
      const ct = response.headers()["content-type"] || "";
      if (ct.includes("json") || ct.includes("javascript") || ct.includes("text")) {
        preview = (await response.text()).slice(0, 500).replace(/\s+/g, " ");
      }
    } catch {
      // ignore
    }
    apiHits.push({ status: response.status(), url: url.slice(0, 300), preview });
  });

  await page.goto(`${SALIC_BASE}/autenticacao/index/index`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await waitPastCloudflare(page);
  await page.waitForSelector("#Login", { timeout: 30_000 });
  await page.fill("#Login", username);
  await page.fill("#Senha", password);
  await page.click("#btConfirmar");
  await page.waitForLoadState("networkidle", { timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "02-after-login.png"), fullPage: true });
  console.log("after login", page.url());
  console.log(
    "body after login",
    (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 400),
  );

  const listUrls = [
    `${SALIC_BASE}/projeto/#/listar-projetos-proponente`,
    `${SALIC_BASE}/projeto/index`,
    `${SALIC_BASE}/principal`,
  ];

  for (const [i, url] of listUrls.entries()) {
    console.log("\n=== goto", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await waitPastCloudflare(page).catch(() => undefined);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT, `03-list-${i}.png`), fullPage: true });
    const info = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
        href: (a.getAttribute("href") || "").slice(0, 160),
        text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      }));
      return {
        url: location.href,
        title: document.title,
        body: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1200),
        hashAnchors: anchors.filter((a) => a.href.includes("#/")).slice(0, 30),
        pronacLike: (document.body?.innerText || "").match(/\b\d{5,7}\b/g)?.slice(0, 30) || [],
      };
    });
    console.log(JSON.stringify(info, null, 2).slice(0, 2000));
  }

  await writeFile(path.join(OUT, "full-dump.json"), JSON.stringify({ apiHits }, null, 2));
  console.log("\napiHits", apiHits.length);
  for (const h of apiHits) {
    console.log(h.status, h.url);
    if (h.preview) console.log(" ", h.preview.slice(0, 220));
  }

  await browser.close();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
