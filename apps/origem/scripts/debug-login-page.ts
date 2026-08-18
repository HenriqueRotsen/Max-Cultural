import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const OUT = path.join(process.cwd(), ".salic-debug");
const URL = "https://salic.cultura.gov.br/autenticacao/index/index";

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "pt-BR",
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  page.on("console", (msg) => console.log("console", msg.type(), msg.text().slice(0, 200)));
  page.on("pageerror", (err) => console.log("pageerror", err.message.slice(0, 200)));
  page.on("response", (r) => {
    if (r.url().includes("salic") || r.url().includes("cultura")) {
      console.log("resp", r.status(), r.url().slice(0, 180));
    }
  });

  const res = await page.goto(URL, { waitUntil: "networkidle", timeout: 90_000 }).catch((e) => {
    console.log("goto error", e.message);
    return null;
  });
  console.log("final url", page.url(), "status", res?.status());
  await page.waitForTimeout(3000);
  const html = await page.content();
  await writeFile(path.join(OUT, "login.html"), html);
  await page.screenshot({ path: path.join(OUT, "01b-login.png"), fullPage: true });
  console.log("html length", html.length);
  console.log("html preview", html.replace(/\s+/g, " ").slice(0, 800));
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input,button")).map((el) => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      id: el.id,
      text: (el.textContent || "").trim().slice(0, 40),
    })),
  );
  console.log("inputs", inputs);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
