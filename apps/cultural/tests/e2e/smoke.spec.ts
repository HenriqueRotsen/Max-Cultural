import { expect, test } from "@playwright/test";

test.describe("Cultural smoke", () => {
  test("GET /login responde", async ({ request }) => {
    const res = await request.get("/login", { maxRedirects: 0 });
    expect([200, 307, 302]).toContain(res.status());
  });

  test("rota protegida redireciona ou autentica", async ({ request }) => {
    const res = await request.get("/projetos", { maxRedirects: 0 });
    expect(res.status()).not.toBe(404);
    expect([200, 307, 302]).toContain(res.status());
  });

  test("página de login renderiza body", async ({ page }) => {
    const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(response).toBeTruthy();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });
});
