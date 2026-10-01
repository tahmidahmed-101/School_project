import { test, expect } from "@playwright/test"
import { USER_CREDENTIALS, expectPageHeading, fillLogin, loginAsAdmin } from "./auth.helper"

// These tests use a fresh context each, so they exercise the real login/refresh/logout flow.
test.describe("Authentication", () => {
  test("unauthenticated visit redirects to the sign-in page", async ({ page }) => {
    await page.goto("/orders")
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText("Sign in to access the admin dashboard")).toBeVisible()
  })

  test("login lands on the overview and the session survives a reload", async ({ page }) => {
    await loginAsAdmin(page)
    await expectPageHeading(page, "Overview")

    // Access token is memory-only; a reload must re-bootstrap from the refresh cookie.
    await page.goto("/orders")
    await expectPageHeading(page, "Orders")
    await page.reload()
    await expect(page).toHaveURL(/\/orders$/)
    await expectPageHeading(page, "Orders")
  })

  test("wrong password shows an error and stays on /login", async ({ page }) => {
    await fillLogin(page, USER_CREDENTIALS.email, "definitely-not-the-password")
    const toast = page.locator("[data-sonner-toast]").first()
    await expect(toast).toBeVisible()
    await expect(toast).not.toContainText("Signed in successfully")
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled()
  })

  test("client-side validation on an empty sign-in form", async ({ page }) => {
    await page.goto("/login")
    await page.getByRole("button", { name: /sign in/i }).click()
    await expect(page.getByText("Enter a valid email address")).toBeVisible()
    await expect(page.getByText("Password is required")).toBeVisible()
  })

  test("logout returns to /login and protected pages stay locked", async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole("button", { name: "Open user profile menu" }).click()
    await page.getByRole("menuitem", { name: "Logout" }).click()
    await expect(page).toHaveURL(/\/login/)

    // The refresh cookie must be gone/revoked: a full reload of a protected page bounces back.
    await page.goto("/orders")
    await expect(page).toHaveURL(/\/login/)
  })
})
