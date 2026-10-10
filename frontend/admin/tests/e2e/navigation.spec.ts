import type { Page } from "@playwright/test"
import { test, expect, expectPageHeading } from "./auth.helper"

// Mirrors the Shop half and the Business sections of src/app/nav.ts (admin sees every item).
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
      { title: "Carts", url: "/carts", heading: "Carts" },
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
    section: "Customers",
    items: [
      { title: "Customers", url: "/customers", heading: "Customers" },
      { title: "Reviews", url: "/reviews", heading: "Reviews" },
      { title: "Questions", url: "/questions", heading: "Questions" },
      { title: "Price reports", url: "/price_reports", heading: "Price reports" },
      { title: "Fraud cases", url: "/fraud_cases", heading: "Fraud Cases" },
    ],
  },
  {
    section: "Goods",
    items: [
      { title: "Stock", url: "/inventory", heading: "Stock" },
      { title: "Stock movements", url: "/inventory/ledger", heading: "Stock movements" },
      { title: "Reservations", url: "/inventory/reservations", heading: "Reservations" },
      { title: "Warehouses", url: "/warehouses", heading: "Warehouses" },
    ],
  },
  {
    section: "Delivery",
    items: [
      { title: "Shipments", url: "/shipments", heading: "Shipments" },
      { title: "Delivery zones", url: "/shipping_zones", heading: "Delivery zones" },
      { title: "Shipping rates", url: "/shipping_rates", heading: "Shipping rates" },
    ],
  },
  {
    section: "Purchasing",
    items: [
      { title: "Suppliers", url: "/purchasing/suppliers", heading: "Suppliers" },
      { title: "Purchase orders", url: "/purchasing/orders", heading: "Purchase orders" },
      { title: "Goods receipts", url: "/purchasing/receipts", heading: "Goods receipts" },
      { title: "Supplier bills", url: "/purchasing/bills", heading: "Vendor Bills" },
      { title: "Supplier payments", url: "/purchasing/payments", heading: "Vendor Payments" },
    ],
  },
  {
    section: "Marketing",
    items: [
      { title: "Promotions", url: "/sales", heading: "Promotions" },
      { title: "Coupons", url: "/coupons", heading: "Coupons" },
    ],
  },
  {
    section: "Settings",
    items: [{ title: "Shop settings", url: "/settings", heading: "Shop settings" }],
  },
  {
    section: "Accounting",
    items: [
      { title: "Financial reports", url: "/accounting/reports", heading: "Financial Reports" },
      { title: "Expenses", url: "/expenses", heading: "Expenses" },
      { title: "Expense categories", url: "/expenses/categories", heading: "Expense categories" },
      { title: "Journal entries", url: "/accounting/journal-entries", heading: "Journal entries" },
      { title: "Chart of accounts", url: "/accounting/accounts", heading: "Chart of accounts" },
      { title: "Tax rates", url: "/accounting/tax-rates", heading: "Tax rates" },
    ],
  },
  {
    section: "Team",
    items: [
      { title: "Staff", url: "/staffs", heading: "Staff" },
      { title: "Audit logs", url: "/audit-logs", heading: "Audit logs" },
      { title: "Login history", url: "/login-history", heading: "Login history" },
    ],
  },
  {
    section: "Shared",
    items: [
      { title: "Carriers", url: "/carriers", heading: "Carriers" },
      { title: "Blocklists", url: "/blocklists", heading: "Blocklists" },
      { title: "Subscribers", url: "/subscribers", heading: "Subscribers" },
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
  // A few sections per test, so no single test outgrows its timeout.
  const GROUPS: Record<string, string[]> = {
    "SHOP SELLING": ["Home", "Sales", "Catalog", "Customers"],
    "SHOP OPERATIONS": ["Goods", "Delivery", "Purchasing", "Marketing", "Settings"],
    ACCOUNTING: ["Accounting"],
    BUSINESS: ["Team", "Shared"],
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
