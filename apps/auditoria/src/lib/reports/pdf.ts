/** Horário de Brasília (UTC−3): o servidor roda em UTC. */
const REPORT_TIME_ZONE = "America/Sao_Paulo";


function formatPdfTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: REPORT_TIME_ZONE,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  return `${get("day")}/${get("month")}/${get("year")} · ${get("hour")}:${get("minute")}`;
}

/** Stamp seguro para nome de arquivo: 11082026-144732 */
export function reportFileStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: REPORT_TIME_ZONE,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  return `${get("day")}${get("month")}${get("year")}-${get("hour")}${get("minute")}${get("second")}`;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  try {
    return await htmlToPdfOnce(html);
  } catch (e) {
    if (!isClosedError(e)) throw e;
    const { browserEnvDiagnostics } = await import("@/lib/browser");
    console.error(`[relatorio] navegador fechou; tentando de novo (${await browserEnvDiagnostics()})`);
    return htmlToPdfOnce(html);
  }
}

async function htmlToPdfOnce(html: string): Promise<Buffer> {
  const { launchChromium } = await import("@/lib/browser");
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle", timeout: 90_000 });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });

    const fromMeta = await page
      .locator('meta[name="max-auditoria-generated-at"]')
      .getAttribute("content")
      .catch(() => null);
    const generatedAt = fromMeta || formatPdfTimestamp();

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#6b7280;padding:0 12mm;display:flex;justify-content:space-between;font-family:Montserrat,sans-serif;">
          <span>MAX Auditoria · Gerado em ${generatedAt}</span>
          <span>Página <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>
      `,
      // Espaço do rodapé com timestamp; laterais/topo via @page no HTML
      margin: { top: "0", right: "0", bottom: "12mm", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

const isClosedError = (e: unknown) =>
  /has been closed|Target closed|crashed|parte travou/i.test(e instanceof Error ? e.message : String(e));

/** Uma parte que passa disso travou: o navegador é fechado e ela é tentada de novo. */
const PART_TIMEOUT_MS = 75_000;
/** A rota tem 300 s; para antes e devolve uma mensagem em vez de estourar o tempo. */
const TOTAL_BUDGET_MS = 260_000;

export class ReportTooSlowError extends Error {
  constructor() {
    super("O relatório demorou demais para ficar pronto. Tente com menos PRONACs de cada vez.");
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Promise<void>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void onTimeout().finally(() => reject(new Error("parte travou")));
    }, ms);
  });
  try {
    return await Promise.race([p, t]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PDF de várias partes HTML (relatório grande): cada parte vira um PDF numa
 * mesma aba (o conteúdo é trocado a cada parte), e no fim tudo é unido, com o rodapé
 * "Gerado em · Página X / Y" carimbado na numeração final. Assim a memória do
 * Chromium fica do tamanho de uma parte, não do relatório inteiro.
 */
export async function htmlPartsToPdf(parts: string[]): Promise<Buffer> {
  if (parts.length === 1) return htmlToPdf(parts[0]!);
  const { launchChromium, browserEnvDiagnostics } = await import("@/lib/browser");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  let browser = await launchChromium();
  // Uma aba só para todas as partes: na Vercel o Chromium roda em processo
  // único e fechar a aba derruba o navegador inteiro.
  let page: Awaited<ReturnType<typeof browser.newPage>> | null = null;
  const renderPart = async (html: string) => {
    if (!page) {
      page = await browser.newPage();
      await page.emulateMedia({ media: "print" });
    }
    await page.setContent(html, { waitUntil: "load", timeout: 90_000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "12mm", left: "0" },
    });
    // Solta o conteúdo da parte antes da próxima.
    await page.setContent("<html><body></body></html>").catch(() => {});
    return bytes;
  };

  const generatedAt = formatPdfTimestamp();
  const out = await PDFDocument.create();
  const started = Date.now();
  const render = (html: string) =>
    withTimeout(renderPart(html), PART_TIMEOUT_MS, () => browser.close().catch(() => {}));
  try {
    for (const [i, html] of parts.entries()) {
      if (Date.now() - started > TOTAL_BUDGET_MS) throw new ReportTooSlowError();
      let bytes: Uint8Array;
      try {
        bytes = await render(html);
      } catch (e) {
        if (!isClosedError(e)) throw e;
        // Navegador caiu: abre outro e tenta esta parte de novo, uma vez.
        console.error(
          `[relatorio] parte ${i + 1}/${parts.length}: navegador fechou; tentando de novo (${await browserEnvDiagnostics()})`,
        );
        await browser.close().catch(() => {});
        page = null;
        if (Date.now() - started > TOTAL_BUDGET_MS) throw new ReportTooSlowError();
        browser = await launchChromium();
        bytes = await render(html);
      }
      const doc = await PDFDocument.load(bytes);
      const pages = await out.copyPages(doc, doc.getPageIndices());
      for (const p of pages) out.addPage(p);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const font = await out.embedFont(StandardFonts.Helvetica);
  const total = out.getPageCount();
  const gray = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255);
  const size = 6;
  const left = `MAX Auditoria · Gerado em ${generatedAt}`;
  out.getPages().forEach((page, i) => {
    const { width } = page.getSize();
    const right = `Página ${i + 1} / ${total}`;
    const y = 14;
    page.drawText(left, { x: 34, y, size, font, color: gray });
    page.drawText(right, {
      x: width - 34 - font.widthOfTextAtSize(right, size),
      y,
      size,
      font,
      color: gray,
    });
  });
  return Buffer.from(await out.save({ useObjectStreams: true }));
}
