/**
 * Descobre endpoints de relação de pagamento na área logada.
 */
import { chromium, type Page } from "playwright";
import { prisma } from "../src/lib/db";
import { decryptCredential, normalizeCgccpf } from "../src/lib/crypto";

const SALIC_BASE = "https://salic.cultura.gov.br";

async function waitPastCloudflare(page: Page) {
  await page.waitForFunction(
    () => {
      const t = document.title || "";
      const body = document.body?.innerText || "";
      return !/just a moment/i.test(t) && !/enable javascript and cookies/i.test(body);
    },
    { timeout: 90_000 },
  );
}

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${SALIC_BASE}/autenticacao/index/index`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await waitPastCloudflare(page);
  await page.waitForSelector("#Login", { timeout: 30_000 });
  await page.fill("#Login", user);
  await page.fill("#Senha", pass);
  await Promise.all([
    page.waitForURL(/comunicados|principal|projeto|proponente/i, { timeout: 90_000 }).catch(() => undefined),
    page.click("#btConfirmar"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
}

async function main() {
  const account = await prisma.salicAccount.findFirst({
    where: { active: true, salicUsernameEnc: { not: null }, salicPasswordEnc: { not: null } },
  });
  if (!account?.salicUsernameEnc || !account.salicPasswordEnc) throw new Error("Sem credenciais");
  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) throw new Error("Sem credenciais");
  const wantCnpj = normalizeCgccpf(account.cgccpf);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "pt-BR",
  });
  const page = await context.newPage();
  await login(page, username, password);
  console.log("logged", page.url());

  // Use page.request with cookies from browser context
  const props = await page.evaluate(async () => {
    const r = await fetch("/projeto/projeto-rest/proponente-ajax", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return r.json();
  });
  const proponentes = (props?.data?.proponentes || []) as Array<{
    idAgenteProponente: number;
    CPF: string;
    Nome: string;
  }>;
  console.log(
    "proponentes",
    proponentes.map((p) => ({ id: p.idAgenteProponente, cpf: p.CPF, nome: p.Nome.slice(0, 60) })),
  );
  const match =
    proponentes.find((p) => normalizeCgccpf(p.CPF) === wantCnpj) ||
    proponentes.find((p) => p.Nome.includes(wantCnpj));
  if (!match) throw new Error(`Proponente ${wantCnpj} não encontrado no login`);
  console.log("match", match);

  const projects = await page.evaluate(async (id) => {
    const r = await fetch(`/projeto/projeto-rest/index?idProponente=${id}&mecanismo=1`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return r.json();
  }, match.idAgenteProponente);
  const list = (projects?.data || []) as Array<{
    Pronac: string;
    idPronacHash: string;
    NomeProjeto: string;
  }>;
  console.log("projects", list.length);
  console.log(list.slice(0, 5));
  const target = list.find((p) => p.Pronac === "153774") || list[0];
  if (!target) throw new Error("Sem projetos");
  console.log("target", target);

  const hits: Array<{ url: string; preview: string }> = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (!/pagamento|comprovante|relacao|prestacao|rest/i.test(url)) return;
    let preview = "";
    try {
      preview = (await res.text()).slice(0, 400).replace(/\s+/g, " ");
    } catch {
      //
    }
    hits.push({ url: url.slice(0, 250), preview });
  });

  await page.goto(`${SALIC_BASE}/projeto/#/${target.idPronacHash}/relacao-pagamento`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(6000);
  console.log("relacao url", page.url());
  console.log(
    "body",
    (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 800),
  );
  console.log("hits", hits.length);
  for (const h of hits) {
    console.log(h.url);
    console.log(" ", h.preview.slice(0, 300));
  }

  // Probe common REST paths
  const probes = [
    `/projeto/projeto-rest/relacao-pagamento?idPronacHash=${encodeURIComponent(target.idPronacHash)}`,
    `/projeto/projeto-rest/relacaopagamento?idPronac=${target.Pronac}`,
    `/projeto/projeto-rest/comprovacao?idPronacHash=${encodeURIComponent(target.idPronacHash)}`,
    `/execucao/pagamento-rest/index?idPronacHash=${encodeURIComponent(target.idPronacHash)}`,
  ];
  for (const path of probes) {
    const r = await page.evaluate(async (p) => {
      const res = await fetch(p, { credentials: "include", headers: { Accept: "application/json" } });
      const text = await res.text();
      return { status: res.status, text: text.slice(0, 300) };
    }, path);
    console.log("probe", r.status, path, r.text.slice(0, 180).replace(/\s+/g, " "));
  }

  await browser.close();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
