import { expect, test } from "@playwright/test";

/**
 * Smoke de sistema: a app responde e a rota de notificações existe.
 * Com auth ligada, redireciona ao login do hub; com auth aberta, renderiza a página.
 */
test.describe("Origem smoke", () => {
  test("GET /painel responde", async ({ request }) => {
    const res = await request.get("/painel", { maxRedirects: 0 });
    expect([200, 307, 302]).toContain(res.status());
  });

  test("GET /notificacoes não é 404", async ({ request }) => {
    const res = await request.get("/notificacoes", { maxRedirects: 0 });
    expect(res.status()).not.toBe(404);
    expect([200, 307, 302]).toContain(res.status());
  });

  test("página de login do hub ou app carrega a partir do redirect", async ({
    page,
  }) => {
    const response = await page.goto("/notificacoes", {
      waitUntil: "domcontentloaded",
    });
    expect(response).toBeTruthy();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });
});
