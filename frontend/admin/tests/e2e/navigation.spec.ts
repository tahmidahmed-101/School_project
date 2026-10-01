import type { Page } from "@playwright/test"
import { test, expect, expectPageHeading } from "./auth.helper"

// Mirrors the nav entries in src/features/*/module.ts (admin sees every item).
const SIDEBAR: { section: string; items: { title: string; url: string; heading: string | RegExp }[] }[] = [
  {
    section: "Home",
    items: [
      { title: "Overview", url: "/", heading: "Overview" },
      { title: "Analytics", url: "/analytics", heading: "Analytics" },
    ],
  },
  {
    section: "Sales",
    items: [
      { title: "Orders", url: "/orders", heading: "Orders" },
      { title: "Payments", url: "/payments", heading: "Payments" },
      { title: "Returns", url: "/returns", heading: "Returns" },
    ],
  },
  {
    section: "Catalog",
    items: [
      { title: "Products", url: "/products", heading: "Products" },
      { title: "Variants", url: "/variants", heading: "Variants" },
      { title: "Bundles", url: "/bundles", heading: "Bundles" },
      { title: "Categories", url: "/categories", heading: "Categories" },
      { title: "Brands", url: "/brands", heading: "Brands" },
    ],
  },
  {
    section: "People",
    items: [
      { title: "Customers", url: "/customers", heading: "Customers" },
      { title: "Staff", url: "/staffs", heading: "Staff Members" },
    ],
  },
  {
    section: "Marketing",
    items: [
      { title: "Coupons", url: "/coupons", heading: "Coupons" },
      { title: "Subscribers", url: "/subscribers", heading: "Newsletter Subscribers" },
    ],
  },
  {
    section: "Inventory",
    items: [
      { title: "Stock", url: "/inventory", heading: "Stock" },
      { title: "Stock Ledger", url: "/inventory/ledger", heading: "Stock Ledger" },
      { title: "Warehouses", url: "/warehouses", heading: "Warehouses" },
      { title: "Reservations", url: "/inventory/reservations", heading: "Stock Reservations" },
    ],
  },
  {
    section: "Logistics",
    items: [
      { title: "Shipments", url: "/shipments", heading: "Shipments" },
      { title: "Carriers", url: "/carriers", heading: "Carriers" },
      { title: "Delivery Zones", url: "/shipping_zones", heading: "Delivery Zones" },
      { title: "Shipping Rates", url: "/shipping_rates", heading: "Shipping Rates" },
    ],
  },
  {
    section: "Purchasing",
    items: [
      { title: "Purchase Orders", url: "/purchasing/orders", heading: "Purchase Orders" },
      { title: "Goods Receipts", url: "/purchasing/receipts", heading: "Goods Receipts" },
      { title: "Suppliers", url: "/purchasing/suppliers", heading: "Suppliers" },
      { title: "Vendor Bills", url: "/purchasing/bills", heading: "Vendor Bills" },
      { title: "Vendor Payments", url: "/purchasing/payments", heading: "Vendor Payments" },
    ],
  },
  {
    section: "Accounting",
    items: [
      { title: "Financial Reports", url: "/accounting/reports", heading: "Financial Reports" },
      { title: "Expenses", url: "/expenses", heading: "Expenses" },
      { title: "Journal Entries", url: "/accounting/journal-entries", heading: "Journal Entries" },
      { title: "Chart of Accounts", url: "/accounting/accounts", heading: "Chart of Accounts" },
      { title: "Tax Rates", url: "/accounting/tax-rates", heading: "Tax Rates" },
    ],
  },
  {
    section: "System",
    items: [
      { title: "Settings", url: "/settings", heading: "Settings" },
      { title: "Audit Logs", url: "/audit-logs", heading: "Audit Logs" },
      { title: "Login History", url: "/login-history", heading: "Login History" },
    ],
  },
  {
    section: "Risk",
    items: [
      { title: "Fraud Cases", url: "/fraud_cases", heading: "Fraud Cases" },
      { title: "Blocklists", url: "/blocklists", heading: "Blocklists" },
    ],
  },
]

/** Clicks a sidebar link, expanding its collapsible section first if needed. */
async function clickSidebarLink(page: Page, section: string, title: string, url: string) {
  const link = page.locator(`a[href="${url}"]`).filter({ hasText: new RegExp(`^${title}$`) })
  await expect(link).toHaveCount(1)
  const clickable = await link
    .click({ trial: true, timeout: 1500 })
    .then(() => true)
    .catch(() => false)
  if (!clickable) {
    await page.getByRole("button", { name: section, exact: true }).click()
  }
  await link.click()
}

test.describe("Sidebar pages", () => {
  // One test per sidebar group (MAIN / OPERATIONS / FINANCE / ADMIN).
  const GROUPS: Record<string, string[]> = {
    MAIN: ["Home", "Sales", "Catalog", "People", "Marketing"],
    OPERATIONS: ["Inventory", "Logistics", "Purchasing"],
    FINANCE: ["Accounting"],
    ADMIN: ["System", "Risk"],
  }
  for (const [group, sections] of Object.entries(GROUPS)) {
    test(`${group}: every sidebar link renders its page`, async ({ adminPage: page }) => {
      await page.goto("/")
      await expectPageHeading(page, "Overview")
      for (const { section, items } of SIDEBAR.filter((s) => sections.includes(s.section))) {
        for (const item of items) {
          await test.step(`${section} > ${item.title}`, async () => {
            await clickSidebarLink(page, section, item.title, item.url)
            await expect(page).toHaveURL(new RegExp(`${item.url === "/" ? "/" : item.url}$`))
            await expectPageHeading(page, item.heading)
          })
        }
      }
    })
  }

  test("unknown route shows the not-found page", async ({ adminPage: page }) => {
    await page.goto("/this-route-does-not-exist")
    await expect(page.getByText("Page not found")).toBeVisible()
    await expect(page).toHaveTitle(/Page not found/)
    await page.getByRole("button", { name: "Back to dashboard" }).click()
    await expectPageHeading(page, "Overview")
  })
})
