import { defineConfig, devices } from "@playwright/test"

// Point the suite at an already-running dev server with E2E_BASE_URL
// (e.g. http://localhost:5199). Defaults to the standard Vite port.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173"
const port = Number(new URL(baseURL).port || 80)

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
})
