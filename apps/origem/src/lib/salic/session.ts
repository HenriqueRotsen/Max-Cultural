/** Sessão na área logada do SALIC (login, Cloudflare, listas) — usada pelo Planejamento. */
import type { Browser, Page } from "playwright-core";
import { mkdir, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const SALIC_BASE = "https://salic.cultura.gov.br";
// Em serverless só /tmp aceita escrita.
const STATE_DIR = process.env.VERCEL
  ? path.join(tmpdir(), "salic-sessions")
  : path.join(process.cwd(), ".salic-sessions");

export type SalicUiProponente = {
  idAgenteProponente: number;
  CPF: string;
  Nome: string;
};

export type SalicUiProject = {
  Pronac: string;
  idPronacHash: string;
  NomeProjeto?: string;
  IdPRONAC?: number;
  Situacao?: string;
};

async function ensureStateDir() {
  await mkdir(STATE_DIR, { recursive: true });
}

function statePath(accountId: string) {
  return path.join(STATE_DIR, `${accountId}.json`);
}

async function loadStorageState(accountId: string) {
  try {
    const raw = await readFile(statePath(accountId), "utf8");
    return JSON.parse(raw) as object;
  } catch {
    return null;
  }
}

async function saveStorageState(
  accountId: string,
  context: { storageState: () => Promise<object> },
) {
  await ensureStateDir();
  const state = await context.storageState();
  await writeFile(statePath(accountId), JSON.stringify(state, null, 2), "utf8");
}

export async function waitPastCloudflare(page: Page) {
  await page.waitForFunction(
    () => {
      const title = document.title || "";
      const body = document.body?.innerText || "";
      return (
        !/just a moment/i.test(title) &&
        !/enable javascript and cookies/i.test(body) &&
        !/checking your browser/i.test(body)
      );
    },
    { timeout: 90_000 },
  );
}

async function looksLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (/autenticacao|login/i.test(url)) return false;
  const body = await page.innerText("body").catch(() => "");
  if (/just a moment|faça\s+login|bem-vindo\(a\)!/i.test(body.slice(0, 2000))) {
    return false;
  }
  return /olá|sessão expira|proponente|comunicados/i.test(body.slice(0, 4000));
}

async function loginSalic(page: Page, username: string, password: string) {
  await page.goto(`${SALIC_BASE}/autenticacao/index/index`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await waitPastCloudflare(page);
  await page.waitForSelector("#Login", { timeout: 30_000 });
  await page.fill("#Login", username);
  await page.fill("#Senha", password);

  const loginResponsePromise = page
    .waitForResponse(
      (res) => /autenticacao\/index\/login/i.test(res.url()) && res.request().method() === "POST",
      { timeout: 60_000 },
    )
    .catch(() => null);

  await page.click("#btConfirmar");
  const loginResponse = await loginResponsePromise;
  if (loginResponse) {
    try {
      const payload = (await loginResponse.json()) as { status?: number; msg?: string };
      if (payload.status !== 1) {
        throw new Error(payload.msg || "Login SALIC rejeitado");
      }
    } catch (error) {
      if (error instanceof Error && /Login SALIC rejeitado|rejeitado/i.test(error.message)) {
        throw error;
      }
      // resposta não-JSON — segue checando a página
    }
  }

  await page.waitForLoadState("networkidle", { timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(2000);

  // Garante página autenticada (redirect pós-login)
  if (!(await looksLoggedIn(page))) {
    await page.goto(`${SALIC_BASE}/comunicados-proponente/#/home-comunicados-proponente`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await waitPastCloudflare(page).catch(() => undefined);
    await page.waitForTimeout(1500);
  }

  if (!(await looksLoggedIn(page))) {
    const snippet = (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 240);
    throw new Error(
      `Falha no login SALIC — verifique usuário/senha ou bloqueio Cloudflare. Página: ${snippet}`,
    );
  }
}

export async function withAccountBrowser(
  accountId: string,
  username: string,
  password: string,
  fn: (page: Page, browser: Browser) => Promise<void>,
) {
  const { launchChromium } = await import("@/lib/browser");
  const browser = await launchChromium();
  try {
    const storage = await loadStorageState(accountId);
    const context = await browser.newContext({
      ...(storage ? { storageState: storage as never } : {}),
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "pt-BR",
      viewport: { width: 1400, height: 900 },
    });
    const page = await context.newPage();

    await page.goto(`${SALIC_BASE}/comunicados-proponente/#/home-comunicados-proponente`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await waitPastCloudflare(page).catch(() => undefined);

    if (!(await looksLoggedIn(page))) {
      await loginSalic(page, username, password);
      await saveStorageState(accountId, context);
    }

    await fn(page, browser);
    await saveStorageState(accountId, context);
    await context.close();
  } finally {
    await browser.close();
  }
}

export async function fetchJson<T>(page: Page, url: string): Promise<T> {
  const result = await page.evaluate(async (path) => {
    const res = await fetch(path, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  }, url);

  if (!result.ok) {
    throw new Error(`HTTP ${result.status} ${url}: ${result.text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new Error(`JSON inválido em ${url}: ${result.text.slice(0, 200)}`);
  }
}

/** Como fetchJson, mas devolve status (útil para 412 = sem planilha homologada). */
export async function fetchJsonAllowError(
  page: Page,
  url: string,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const result = await page.evaluate(async (path) => {
    const res = await fetch(path, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  }, url);

  let json: unknown = null;
  try {
    json = JSON.parse(result.text);
  } catch {
    json = null;
  }
  return { ok: result.ok, status: result.status, json, text: result.text };
}

export async function listProponentesUi(page: Page): Promise<SalicUiProponente[]> {
  const json = await fetchJson<{
    data?: { proponentes?: SalicUiProponente[] };
  }>(page, "/projeto/projeto-rest/proponente-ajax");
  return json.data?.proponentes ?? [];
}

export async function listProjectsUi(page: Page, idProponente: number): Promise<SalicUiProject[]> {
  const json = await fetchJson<{ data?: SalicUiProject[] }>(
    page,
    `/projeto/projeto-rest/index?idProponente=${idProponente}&mecanismo=1`,
  );
  return json.data ?? [];
}

