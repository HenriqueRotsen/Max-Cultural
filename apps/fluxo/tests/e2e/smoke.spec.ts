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
});
