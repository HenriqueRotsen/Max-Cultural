import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { decryptCredential, normalizeCgccpf } from "@/lib/crypto";
import {
  upsertPaymentFromProduto,
  upsertSupplier,
  reconcileProjectPayments,
  reconcileAccountProjects,
  refreshProjectFinancials,
} from "@/lib/salic/persist";
import type { SalicProduto } from "@/lib/salic/api";

const SALIC_BASE = "https://salic.cultura.gov.br";
const STATE_DIR = path.join(process.cwd(), ".salic-sessions");

type SalicUiProponente = {
  idAgenteProponente: number;
  CPF: string;
  Nome: string;
};

type SalicUiProject = {
  Pronac: string;
  idPronacHash: string;
  NomeProjeto?: string;
  IdPRONAC?: number;
  Situacao?: string;
};

type SalicUiPagamento = {
  idPronac?: number;
  Item?: string;
  idComprovantePagamento?: number;
  idPlanilhaAprovacao?: number;
  CNPJCPF?: string;
  Fornecedor?: string;
  DtComprovacao?: string;
  DtPagamento?: string;
  tbDocumento?: string;
  nrComprovante?: string;
  tpFormaDePagamento?: string;
  nrDocumentoDePagamento?: string;
  vlPagamento?: number;
  idArquivo?: number;
  dsJustificativa?: string;
  nmArquivo?: string;
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

async function waitPastCloudflare(page: Page) {
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

async function withAccountBrowser(
  accountId: string,
  username: string,
  password: string,
  fn: (page: Page, browser: Browser) => Promise<void>,
) {
  const browser = await chromium.launch({ headless: true });
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

async function fetchJson<T>(page: Page, url: string): Promise<T> {
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

function decodeHtmlEntities(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function mapUiPagamentoToProduto(
  row: SalicUiPagamento,
  pronac: string,
): SalicProduto & { supplierName?: string; supplierCgccpf?: string } {
  return {
    id_comprovante_pagamento: row.idComprovantePagamento,
    id_planilha_aprovacao: row.idPlanilhaAprovacao,
    nome: row.Item,
    cgccpf: row.CNPJCPF,
    nome_fornecedor: row.Fornecedor,
    data_aprovacao: row.DtComprovacao,
    data_pagamento: row.DtPagamento,
    PRONAC: pronac,
    tipo_documento: decodeHtmlEntities(row.tbDocumento),
    nr_comprovante: row.nrComprovante,
    tipo_forma_pagamento: decodeHtmlEntities(row.tpFormaDePagamento),
    nr_documento_pagamento: row.nrDocumentoDePagamento,
    valor_pagamento: row.vlPagamento ?? 0,
    id_arquivo: row.idArquivo,
    justificativa: row.dsJustificativa?.trim() || undefined,
    nm_arquivo: row.nmArquivo,
    supplierName: row.Fornecedor,
    supplierCgccpf: row.CNPJCPF,
  };
}

async function listProponentesUi(page: Page): Promise<SalicUiProponente[]> {
  const json = await fetchJson<{
    data?: { proponentes?: SalicUiProponente[] };
  }>(page, "/projeto/projeto-rest/proponente-ajax");
  return json.data?.proponentes ?? [];
}

async function listProjectsUi(page: Page, idProponente: number): Promise<SalicUiProject[]> {
  const json = await fetchJson<{ data?: SalicUiProject[] }>(
    page,
    `/projeto/projeto-rest/index?idProponente=${idProponente}&mecanismo=1`,
  );
  return json.data ?? [];
}

async function listPagamentosUi(page: Page, idPronac: number): Promise<SalicUiPagamento[]> {
  const json = await fetchJson<{
    data?: { code?: number; items?: SalicUiPagamento[] };
  }>(page, `/prestacao-contas/relacao-pagamento-rest/index?idPronac=${idPronac}`);
  return json.data?.items ?? [];
}

/**
 * Crawler autenticado via REST da área logada (mais rápido e estável que scrapar HTML).
 * Seleciona o proponente pelo CNPJ da conta Salink.
 */
export async function syncAccountViaCrawler(params: {
  salicAccountId: string;
  pronacs?: string[];
  onProgress?: (message: string) => void | Promise<void>;
}) {
  const account = await prisma.salicAccount.findUniqueOrThrow({
    where: { id: params.salicAccountId },
  });

  if (!account.salicUsernameEnc || !account.salicPasswordEnc) {
    throw new Error("Conta sem credenciais SALIC para crawler");
  }

  const username = decryptCredential(account.salicUsernameEnc);
  const password = decryptCredential(account.salicPasswordEnc);
  if (!username || !password) {
    throw new Error("Conta sem credenciais SALIC para crawler");
  }
  const wantCnpj = normalizeCgccpf(account.cgccpf);
  const filterPronacs = new Set((params.pronacs || []).map(String).filter(Boolean));
  const log: string[] = [];
  const push = async (msg: string) => {
    log.push(msg);
    await params.onProgress?.(msg);
  };

  let projectsSynced = 0;
  let paymentsUpserted = 0;
  let paymentsDeleted = 0;
  let projectsDeleted = 0;

  await withAccountBrowser(account.id, username, password, async (page) => {
    await push("Login OK — buscando proponentes do usuário");
    const proponentes = await listProponentesUi(page);
    await push(`Usuário tem ${proponentes.length} proponente(s) no SALIC`);

    const match =
      proponentes.find((p) => normalizeCgccpf(p.CPF) === wantCnpj) ||
      proponentes.find((p) => normalizeCgccpf(p.Nome) === wantCnpj);

    if (!match) {
      const nomes = proponentes.map((p) => p.Nome).join(" | ");
      throw new Error(
        `CNPJ ${wantCnpj} não está entre os proponentes deste login. Disponíveis: ${nomes || "(nenhum)"}`,
      );
    }

    await push(`Proponente: ${match.Nome}`);
    const projects = await listProjectsUi(page, match.idAgenteProponente);
    const selected = filterPronacs.size
      ? projects.filter((p) => filterPronacs.has(String(p.Pronac)))
      : projects;

    await push(
      filterPronacs.size
        ? `Crawler: ${selected.length}/${projects.length} projeto(s) (filtro PRONAC)`
        : `Crawler: ${selected.length} projeto(s) via REST`,
    );

    if (selected.length === 0) {
      throw new Error(
        filterPronacs.size
          ? `Nenhum dos PRONACs filtrados aparece na área logada deste proponente`
          : `Nenhum projeto retornado para o proponente ${match.Nome}`,
      );
    }

    const seenPronacs = new Set<string>();

    for (const listed of selected) {
      const idPronac = listed.IdPRONAC;
      if (!idPronac) {
        await push(`PRONAC ${listed.Pronac}: sem IdPRONAC — pulando`);
        continue;
      }

      const project = await prisma.project.upsert({
        where: {
          salicAccountId_pronac: {
            salicAccountId: account.id,
            pronac: String(listed.Pronac),
          },
        },
        create: {
          salicAccountId: account.id,
          pronac: String(listed.Pronac),
          name: listed.NomeProjeto || null,
          salicProjectId: listed.idPronacHash,
          lastSyncedAt: new Date(),
        },
        update: {
          name: listed.NomeProjeto || undefined,
          salicProjectId: listed.idPronacHash,
          lastSyncedAt: new Date(),
        },
      });

      await refreshProjectFinancials({
        projectId: project.id,
        pronac: String(listed.Pronac),
      });

      if (!project.complianceRulesetId) {
        const { scheduleProjectRulesetChoice } = await import("@/lib/compliance/choose-ruleset");
        scheduleProjectRulesetChoice(project.id);
      }

      await push(`PRONAC ${listed.Pronac}: baixando relação de pagamentos…`);
      const rows = await listPagamentosUi(page, idPronac);
      const seenPaymentIds = new Set<string>();
      const seenExternalIds = new Set<string>();

      for (const row of rows) {
        if (row.idComprovantePagamento == null) {
          await push(
            `PRONAC ${listed.Pronac}: comprovante sem id ignorado (${row.nrComprovante || row.Item || "?"})`,
          );
          continue;
        }
        const externalId = String(row.idComprovantePagamento);
        if (seenExternalIds.has(externalId)) continue;

        const produto = mapUiPagamentoToProduto(row, String(listed.Pronac));
        const supplier = await upsertSupplier({
          cgccpf: normalizeCgccpf(produto.supplierCgccpf || produto.cgccpf || "0"),
          name: produto.supplierName || produto.nome_fornecedor || "Fornecedor",
        });

        const payment = await upsertPaymentFromProduto({
          projectId: project.id,
          supplierId: supplier.id,
          produto,
          source: "crawler",
        });
        seenPaymentIds.add(payment.id);
        seenExternalIds.add(externalId);
        paymentsUpserted += 1;
      }

      const removed = await reconcileProjectPayments(
        project.id,
        seenPaymentIds,
        seenExternalIds,
      );
      paymentsDeleted += removed;
      projectsSynced += 1;
      seenPronacs.add(String(listed.Pronac));
      await push(
        `PRONAC ${listed.Pronac}: ${seenExternalIds.size} comprovantes no SALIC` +
          (removed ? ` · ${removed} removidos do MAX Origem` : ""),
      );
    }

    // Sync completo da conta: projetos que sumiram do SALIC saem do Salink.
    if (!filterPronacs.size && seenPronacs.size > 0) {
      projectsDeleted = await reconcileAccountProjects(account.id, seenPronacs);
      if (projectsDeleted > 0) {
        await push(
          `Removidos ${projectsDeleted} projeto(s) que não constam mais no SALIC`,
        );
      }
    }
  });

  return {
    projectsSynced,
    paymentsUpserted,
    paymentsDeleted,
    projectsDeleted,
    log: [
      ...log,
      `pagamentosRemovidos=${paymentsDeleted}`,
      `projetosRemovidos=${projectsDeleted}`,
    ],
  };
}
