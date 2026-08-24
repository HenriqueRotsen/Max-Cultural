import { chromium } from "playwright";

function formatPdfTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  return `${get("day")}${get("month")}${get("year")}-${get("hour")}${get("minute")}${get("second")}`;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle", timeout: 90_000 });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });

    const fromMeta = await page
      .locator('meta[name="max-origem-generated-at"]')
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
          <span>MAX Origem · Gerado em ${generatedAt}</span>
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
