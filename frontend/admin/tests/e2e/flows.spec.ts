import type { Page } from "@playwright/test"
import { test, expect, expectPageHeading } from "./auth.helper"

/**
 * Waits for a server-paginated DataTable to show its first real data row. Clickable rows
 * are exposed as role="button" "Open row N" (skeleton rows are not), so this never
 * returns a loading placeholder.
 */
async function firstDataRow(page: Page) {
  const row = page.getByRole("button", { name: "Open row 1", exact: true })
  await expect(row).toBeVisible({ timeout: 15000 })
  return row
}

async function pickComboOption(page: Page, placeholder: string, option: string) {
  await page.getByPlaceholder(placeholder, { exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

async function firstOrderNumber(page: Page) {
  const row = await firstDataRow(page)
  const orderNumber = (await row.getByRole("cell").first().innerText()).trim()
  expect(orderNumber).toMatch(/^SO-/)
  return { row, orderNumber }
}

test.describe("Orders", () => {
  test("list -> detail shows order number, lines and totals", async ({ adminPage: page }) => {
    await page.goto("/orders")
    await expectPageHeading(page, "Orders")
    const { row, orderNumber } = await firstOrderNumber(page)

    await row.getByRole("cell").first().click()
    await expect(page).toHaveURL(/\/order_detail\//)
    await expectPageHeading(page, orderNumber)
    await expect(page.getByText(/^Order lines \(\d+\)$/)).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Unit price" })).toBeVisible()
    await expect(page.getByText("Totals", { exact: true })).toBeVisible()
    await expect(page.getByText("Subtotal", { exact: true })).toBeVisible()
    await expect(page.getByText("Grand total", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Back to orders" }).click()
    await expect(page).toHaveURL(/\/orders$/)
  })

  test("status filter narrows the list to that status", async ({ adminPage: page }) => {
    await page.goto("/orders")
    await expectPageHeading(page, "Orders")
    await firstDataRow(page)

    const listResponse = page.waitForResponse(
      (res) => res.url().includes("/admin/orders/") && res.url().includes("status=delivered")
    )
    await pickComboOption(page, "Status", "Delivered")
    await listResponse

    // Status is column 5 (ORDER #, CUSTOMER, TOTAL, PAYMENT, STATUS, ...).
    const statusCells = page.locator("tbody tr td:nth-child(5)")
    await expect(statusCells.first()).toHaveText(/delivered/i)
    await expect(async () => {
      const statuses = (await statusCells.allInnerTexts()).map((s) => s.trim().toLowerCase())
      expect(statuses.length).toBeGreaterThan(0)
      expect(new Set(statuses)).toEqual(new Set(["delivered"]))
    }).toPass()
  })

  test("search by order number finds exactly that order", async ({ adminPage: page }) => {
    await page.goto("/orders")
    const { orderNumber } = await firstOrderNumber(page)

    await page.getByRole("textbox", { name: "Search order # or email..." }).fill(orderNumber)
    await expect(page.locator("tbody tr")).toHaveCount(1)
    await expect(page.locator("tbody tr").first()).toContainText(orderNumber)
  })
})

test.describe("Catalog", () => {
  test("products list -> product detail", async ({ adminPage: page }) => {
    await page.goto("/products")
    await expectPageHeading(page, "Products")
    await expect(page.getByRole("columnheader", { name: "PRODUCT" })).toBeVisible()
    const row = await firstDataRow(page)
    const name = (await row.getByRole("cell").nth(2).innerText()).split("\n")[0].trim()
    await row.getByRole("cell").nth(2).click()
    await expect(page).toHaveURL(/\/product_detail\//)
    await expectPageHeading(page, name)
    await expect(page.getByText("Description", { exact: true })).toBeVisible()
  })

  test("new product form shows validation errors on empty submit", async ({ adminPage: page }) => {
    await page.goto("/product_form/new")
    await expectPageHeading(page, "Add Product")
    await page.getByRole("button", { name: "Create product" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Name is required" })).toBeVisible()
    await expect(page.getByRole("alert").filter({ hasText: "Choose a category" })).toBeVisible()
    await expect(page).toHaveURL(/\/product_form\/new$/)
  })
})

test.describe("Payments", () => {
  test("refund dialog rejects amounts above the outstanding balance (no refund submitted)", async ({
    adminPage: page,
  }) => {
    // Hard guard: this test must never POST a refund.
    let refundPosted = false
    const onRequest = (req: { method: () => string; url: () => string }) => {
      if (req.method() === "POST" && /refund/i.test(req.url())) refundPosted = true
    }
    page.on("request", onRequest)

    try {
      await page.goto("/payments")
      await expectPageHeading(page, "Payments")
      await firstDataRow(page)
      const listResponse = page.waitForResponse(
        (res) => res.url().includes("/admin/orders/payments/") && res.url().includes("status=captured")
      )
      await pickComboOption(page, "Status", "Captured")
      await listResponse
      // The order-number cell is a link to the order, so click the status cell instead.
      const capturedCell = (await firstDataRow(page)).getByRole("cell").filter({ hasText: /^captured$/i })
      await expect(capturedCell).toBeVisible()
      await capturedCell.click()

      await expect(page).toHaveURL(/\/payment_detail\//)
      await expect(page.getByText("Outstanding", { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "Refund" }).click()

      const dialog = page.getByRole("dialog", { name: "Refund payment" })
      await expect(dialog).toBeVisible()
      const amount = dialog.getByLabel("Amount")
      const outstanding = Number(await amount.getAttribute("max"))
      expect(outstanding).toBeGreaterThan(0)

      await amount.fill((outstanding + 1).toFixed(2))
      await expect(dialog.getByText(/Enter an amount between/)).toBeVisible()
      await expect(amount).toHaveAttribute("aria-invalid", "true")
      await expect(dialog.getByRole("button", { name: "Refund", exact: true })).toBeDisabled()

      await amount.fill("0")
      await expect(dialog.getByText(/Enter an amount between/)).toBeVisible()
      await expect(dialog.getByRole("button", { name: "Refund", exact: true })).toBeDisabled()

      // A valid partial amount clears the error and labels the button with the amount.
      await amount.fill("1")
      await expect(dialog.getByText(/Enter an amount between/)).toHaveCount(0)
      await expect(dialog.getByRole("button", { name: /^Refund .+/ })).toBeEnabled()

      await dialog.getByRole("button", { name: "Cancel" }).click()
      await expect(dialog).toBeHidden()
      expect(refundPosted).toBe(false)
    } finally {
      page.off("request", onRequest)
    }
  })
})

test.describe("Global search", () => {
  test("Ctrl+K finds and opens a page", async ({ adminPage: page }) => {
    await page.goto("/")
    await expectPageHeading(page, "Overview")
    await page.keyboard.press("Control+K")
    const input = page.getByRole("combobox", { name: "Search" }).first()
    await expect(input).toBeFocused()
    await input.fill("Journal")
    await page.getByRole("option", { name: /Journal Entries/ }).click()
    await expect(page).toHaveURL(/\/accounting\/journal-entries$/)
    await expectPageHeading(page, "Journal Entries")
  })

  test("Ctrl+K finds an order by number from live data", async ({ adminPage: page }) => {
    await page.goto("/orders")
    const { orderNumber } = await firstOrderNumber(page)

    await page.keyboard.press("Control+K")
    const input = page.getByRole("combobox", { name: "Search" }).first()
    await expect(input).toBeFocused()
    await input.fill(orderNumber)
    await page.getByRole("option", { name: new RegExp(`Order ${orderNumber}`) }).click()
    await expect(page).toHaveURL(/\/order_detail\//)
    await expectPageHeading(page, orderNumber)
  })
})

test.describe("Settings & analytics", () => {
  test("settings opens on the business profile tab and tabs sync to the URL", async ({ adminPage: page }) => {
    await page.goto("/settings")
    await expectPageHeading(page, "Settings")
    await expect(page.getByRole("tab", { name: "Business Profile" })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByLabel("Business name")).toBeVisible()
    await expect(page.getByText("Identity", { exact: true })).toBeVisible()

    await page.getByRole("tab", { name: "Modules" }).click()
    await expect(page).toHaveURL(/[?&]tab=modules/)
    await expect(page.getByRole("tab", { name: "Modules" })).toHaveAttribute("aria-selected", "true")
  })

  test("analytics date preset changes the report range", async ({ adminPage: page }) => {
    await page.goto("/analytics")
    await expectPageHeading(page, "Analytics")
    const period = () => page.getByRole("radiogroup", { name: "Report period" })
    await expect(period().getByRole("radio", { name: /30D/ })).toHaveAttribute("aria-checked", "true")
    const rangeText = page.locator("p[aria-live=polite]").filter({ hasText: "–" })
    const before = await rangeText.innerText()

    await period().getByRole("radio", { name: /7D/ }).click()
    await expect(page).toHaveURL(/[?&]range=7d/)
    await expect(period().getByRole("radio", { name: /7D/ })).toHaveAttribute("aria-checked", "true")
    await expect(rangeText).not.toHaveText(before)

    // The preset lives in the URL, so it survives a reload.
    await page.reload()
    await expect(period().getByRole("radio", { name: /7D/ })).toHaveAttribute("aria-checked", "true")
  })
})
