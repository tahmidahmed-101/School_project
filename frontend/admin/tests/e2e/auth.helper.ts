import { type Page, expect, test as base } from "@playwright/test"

// Credentials come from the environment (never commit them). Set E2E_EMAIL and
// E2E_PASSWORD in your shell or a git-ignored .env.local before running Playwright.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}: set it in the environment before running e2e tests`)
  }
  return value
}

export const USER_CREDENTIALS = {
  get email() {
    return requireEnv("E2E_EMAIL")
  },
  get password() {
    return requireEnv("E2E_PASSWORD")
  },
}

export async function fillLogin(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: /sign in/i }).click()
}

export async function loginAsAdmin(page: Page) {
  await fillLogin(page, USER_CREDENTIALS.email, USER_CREDENTIALS.password)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20000 })
}

/**
 * The access token lives only in memory; the session is an HttpOnly refresh cookie that
 * the backend rotates (and blacklists) on every /auth/refresh/. Sharing a saved
 * storageState across fresh contexts would therefore break after the first refresh, so
 * instead each worker logs in once and keeps ONE browser context/page for all its tests.
 * Every page.goto re-bootstraps via /auth/refresh/ inside that same context, which keeps
 * the rotating cookie consistent.
 */
export const test = base.extend<{ adminPage: Page }, { workerAdminPage: Page }>({
  workerAdminPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext()
      const page = await context.newPage()
      await loginAsAdmin(page)
      await use(page)
      await context.close()
    },
    { scope: "worker" },
  ],
  adminPage: async ({ workerAdminPage }, use) => {
    await use(workerAdminPage)
    // Leave no dialog/popover open for the next test.
    await workerAdminPage.keyboard.press("Escape").catch(() => {})
  },
})

export { expect }

/** Asserts a routed page rendered its <h1> and not the route error boundary. */
export async function expectPageHeading(page: Page, heading: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText("Something went wrong")).toHaveCount(0)
  await expect(page.getByText("A new version is available")).toHaveCount(0)
}
