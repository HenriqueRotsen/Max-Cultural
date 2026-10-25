import { expect, test } from "@playwright/test";

/**
 * Smoke de sistema: a app responde. Com auth ligada, redireciona ao login do hub.
 */
test.describe("Auditoria smoke", () => {
  test("GET /inicio responde", async ({ request }) => {
    const res = await request.get("/inicio", { maxRedirects: 0 });
    expect([200, 307, 302]).toContain(res.status());
  });

  test("GET /atualizacao não é 404", async ({ request }) => {
    const res = await request.get("/atualizacao", { maxRedirects: 0 });
    expect(res.status()).not.toBe(404);
  });
});
