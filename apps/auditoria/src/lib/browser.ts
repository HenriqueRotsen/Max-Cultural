import type { Browser } from "playwright-core";

/** Prefixo das pastas temporárias de cada Chromium aberto na Vercel. */
const TMP_PREFIX = "max-chromium-";
/** Pasta temporária mais velha que isso é sobra de execução que caiu. */
const STALE_MS = 15 * 60_000;

/** Navegadores abertos por este processo agora (a instância atende vários pedidos). */
let openBrowsers = 0;

/**
 * Sem nenhum navegador nosso aberto, qualquer Chromium vivo é sobra de um que
 * caiu: ele continua segurando os arquivos apagados de /tmp e o espaço não
 * volta. Encerra esses processos.
 */
async function killOrphanChromium(executablePath: string) {
  const fs = await import("node:fs/promises");
  const pids = await fs.readdir("/proc").catch(() => [] as string[]);
  let killed = 0;
  for (const pid of pids) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
    const cmd = await fs.readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
    if (!cmd.startsWith(executablePath)) continue;
    try {
      process.kill(Number(pid), "SIGKILL");
      killed++;
    } catch {}
  }
  if (killed) console.error(`[navegador] ${killed} Chromium sobrando encerrado(s)`);
}

/**
 * Na Vercel a mesma instância atende vários pedidos e o /tmp é pequeno.
 * Se um Chromium cai no meio, a memória compartilhada e o perfil dele ficam
 * em /tmp, e daí em diante nenhum navegador novo consegue renderizar.
 * Apaga essas sobras antes de abrir outro.
 */
async function cleanStaleTmp(tmp: string, force: boolean) {
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
        // Despejo de memória (core.*) de Chromium que caiu nunca serve: sai sempre.
        if (st && (force || n.startsWith("core.") || now - st.mtimeMs > STALE_MS)) {
          await fs.rm(full, { recursive: true, force: true }).catch(() => {});
        }
      }),
  );
}

/** /dev/shm existe e tem pelo menos 512 MB livres? */
async function devShmRoomy(): Promise<boolean> {
  const fs = await import("node:fs");
  try {
    const s = fs.statfsSync("/dev/shm");
    return s.bavail * s.bsize >= 512 * 1024 * 1024;
  } catch {
    return false;
  }
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
  let shm = "sem /dev/shm";
  try {
    const s = fs.statfsSync("/dev/shm");
    shm = `${mb(s.bavail * s.bsize)} livres`;
  } catch {}
  let top = "";
  try {
    const { execSync } = await import("node:child_process");
    top = execSync(`du -sm ${os.tmpdir()}/* ${os.tmpdir()}/.[!.]* 2>/dev/null | sort -rn | head -6`, {
      timeout: 5000,
    })
      .toString()
      .trim()
      .replace(/\s*\n\s*/g, ", ");
  } catch {}
  return `rss=${mb(process.memoryUsage().rss)} memLivre=${mb(os.freemem())}/${mb(os.totalmem())} tmp=${disk} shm=${shm} navegadores=${openBrowsers} maiores=[${top}]`;
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
    const chromiumBin = await serverless.executablePath();
    // Sem despejo de memória: cada queda do Chromium gravava ~70 MB em /tmp.
    const wrapper = path.join(tmp, "chromium-sem-core.sh");
    const executablePath = await fs
      .writeFile(wrapper, `#!/bin/sh\nulimit -c 0\nexec "${chromiumBin}" "$@"\n`, { mode: 0o755 })
      .then(() => wrapper)
      .catch(() => chromiumBin);
    if (openBrowsers === 0) await killOrphanChromium(chromiumBin);
    await cleanStaleTmp(tmp, openBrowsers === 0);
    const ownTmp = await fs.mkdtemp(path.join(tmp, TMP_PREFIX));
    const browser = await chromium.launch({
      executablePath,
      args: serverless.args,
      headless: true,
      env: { ...process.env, TMPDIR: ownTmp, TMP: ownTmp, TEMP: ownTmp },
      // O Playwright manda a memória compartilhada para /tmp (só 525 MB na
      // Vercel, 200 MB já do Chromium). Se houver /dev/shm com folga, usa ele.
      ignoreDefaultArgs: (await devShmRoomy()) ? ["--disable-dev-shm-usage"] : undefined,
    });
    openBrowsers++;
    browser.once("disconnected", () => {
      openBrowsers = Math.max(0, openBrowsers - 1);
      void fs.rm(ownTmp, { recursive: true, force: true }).catch(() => {});
    });
    return browser;
  }
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true }) as unknown as Promise<Browser>;
}
