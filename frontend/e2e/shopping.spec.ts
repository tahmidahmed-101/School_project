import { expect, test } from "@playwright/test";

// These journeys need real products, so they only run against a live backend: E2E_BACKEND=1 npm run test:e2e
test.skip(!process.env.E2E_BACKEND, "needs the LaunchCart backend (set E2E_BACKEND=1)");

test.describe("shopping journey", () => {
  test("browse the shop, open a product and add it to the cart", async ({ page }) => {
    await page.goto("/shop");
    const firstProduct = page.locator('a[href^="/product/"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    await expect(page).toHaveURL(/\/product\//);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = blocks.map((b) => (JSON.parse(b) as { "@type": string })["@type"]);
    expect(types).toContain("Product");

    await page
      .getByRole("button", { name: /add to cart/i })
      .first()
      .click();
    await page.goto("/checkout");
    await expect(page.getByText("Complete your order")).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm order/i })).toBeVisible();
  });

  test("checkout validates required fields before calling the API", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('a[href^="/product/"]').first().click();
    await page
      .getByRole("button", { name: /add to cart/i })
      .first()
      .click();
    await page.goto("/checkout");

    let orderRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/public/checkout")) orderRequests += 1;
    });
    await page.getByRole("button", { name: /confirm order/i }).click();
    await expect(page.getByText("This field is required").first()).toBeVisible();
    expect(orderRequests).toBe(0);
  });

  test("header search suggests products after the first focus", async ({ page }) => {
    await page.goto("/");
    const search = page.getByLabel("Search products").first();
    await search.focus();
    await search.fill("a");
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
  });
});
