import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.ORIGEM_URL || "http://localhost:3001";

/**
 * Testes de sistema (smoke). Requer `npm run dev:origem` (ou ORIGEM_URL apontando
 * para uma instância). Rode: `npm run test:e2e -w max-origem`
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
