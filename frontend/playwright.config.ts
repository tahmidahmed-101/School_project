import { defineConfig, devices } from "@playwright/test";

const PORT = 3002;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a real Next server. Smoke tests work without the LaunchCart backend (the storefront
 * shows its "catalogue unavailable" state); the journeys that need products are skipped unless E2E_BACKEND=1 and
 * the backend from ../backend is running on 127.0.0.1:8000.
 *
 * Run `npx playwright install chromium` once, then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build exercises what ships (CSP, ISR, metadata); reuse a running server locally.
    command: `npm run build && npm run start`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
