import { expect, test } from "@playwright/test";

test.describe("Fluxo smoke", () => {
  test("GET / responde", async ({ request }) => {
    const res = await request.get("/", { maxRedirects: 0 });
    expect([200, 307, 302]).toContain(res.status());
  });

  test("GET /dashboard não é 404", async ({ request }) => {
    const res = await request.get("/dashboard", { maxRedirects: 0 });
    expect(res.status()).not.toBe(404);
    expect([200, 307, 302]).toContain(res.status());
  });

  test("landing renderiza body", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response).toBeTruthy();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });

  test("GET /f/slug-inexistente não é 500", async ({ request }) => {
    const res = await request.get("/f/slug-inexistente-smoke-test", {
      maxRedirects: 0,
    });
    expect(res.status()).toBeLessThan(500);
    expect([200, 404]).toContain(res.status());
  });

  test("página pública de formulário inexistente renderiza mensagem", async ({
    page,
  }) => {
    const response = await page.goto("/f/slug-inexistente-smoke-test", {
      waitUntil: "domcontentloaded",
    });
    expect(response).toBeTruthy();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.getByText(/formulário indisponível/i)).toBeVisible();
  });
});
