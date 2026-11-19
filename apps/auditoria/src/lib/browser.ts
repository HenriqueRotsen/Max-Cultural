import type { Browser } from "playwright-core";

/** Prefixo das pastas temporárias de cada Chromium aberto na Vercel. */
const TMP_PREFIX = "max-chromium-";
/** Pasta temporária mais velha que isso é sobra de execução que caiu. */
const STALE_MS = 15 * 60_000;

/**
 * Na Vercel a mesma instância atende vários pedidos e o /tmp é pequeno.
 * Se um Chromium cai no meio, a memória compartilhada e o perfil dele ficam
 * em /tmp, e daí em diante nenhum navegador novo consegue renderizar.
 * Apaga essas sobras antes de abrir outro.
 */
async function cleanStaleTmp(tmp: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const now = Date.now();
  const entries = await fs.readdir(tmp).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter(
        (n) =>
          n.startsWith(TMP_PREFIX) ||
          n.startsWith("playwright_chromiumdev_profile-") ||
          n.startsWith("playwright-artifacts-") ||
          n.startsWith(".org.chromium.") ||
          n.startsWith("core."),
      )
      .map(async (n) => {
        const full = path.join(tmp, n);
        const st = await fs.stat(full).catch(() => null);
        if (st && now - st.mtimeMs > STALE_MS) {
          await fs.rm(full, { recursive: true, force: true }).catch(() => {});
        }
      }),
  );
}

/** Memória e espaço em /tmp, para o log quando o navegador cai. */
export async function browserEnvDiagnostics(): Promise<string> {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const mb = (n: number) => `${Math.round(n / 1024 / 1024)}MB`;
  let disk = "?";
  try {
    const s = fs.statfsSync(os.tmpdir());
    disk = `${mb(s.bavail * s.bsize)} livres de ${mb(s.blocks * s.bsize)}`;
  } catch {}
  return `rss=${mb(process.memoryUsage().rss)} memLivre=${mb(os.freemem())}/${mb(os.totalmem())} tmp=${disk}`;
}

/**
 * Chromium headless para o robô do SALIC e PDFs.
 * Na Vercel não há navegador instalado: usa o binário de @sparticuz/chromium,
 * cada um com a própria pasta temporária, apagada ao fechar.
 * Local: navegador do Playwright.
 */
export async function launchChromium(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const [{ default: serverless }, { chromium }, os, fs, path] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
      import("node:os"),
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const tmp = os.tmpdir();
    await cleanStaleTmp(tmp);
    const ownTmp = await fs.mkdtemp(path.join(tmp, TMP_PREFIX));
    const browser = await chromium.launch({
      executablePath: await serverless.executablePath(),
      args: serverless.args,
      headless: true,
      env: { ...process.env, TMPDIR: ownTmp, TMP: ownTmp, TEMP: ownTmp },
    });
    browser.once("disconnected", () => {
      void fs.rm(ownTmp, { recursive: true, force: true }).catch(() => {});
    });
    return browser;
  }
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true }) as unknown as Promise<Browser>;
}
