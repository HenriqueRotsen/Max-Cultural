import type { Browser } from "playwright-core";

/**
 * Chromium headless para o robô do SALIC e PDFs.
 * Na Vercel não há navegador instalado: usa o binário de @sparticuz/chromium
 * (mesma major do Chromium do playwright-core). Local: navegador do Playwright.
 */
export async function launchChromium(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const [{ default: serverless }, { chromium }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
    ]);
    return chromium.launch({
      executablePath: await serverless.executablePath(),
      args: serverless.args,
      headless: true,
    });
  }
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true }) as unknown as Promise<Browser>;
}
