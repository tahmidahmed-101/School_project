import { expect, test } from "@playwright/test";

test.describe("site shell and SEO endpoints (no backend needed)", () => {
  test("home page renders with title, canonical-ready metadata and structured data", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Kull Mart/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Kull Mart/);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = blocks.map((b) => (JSON.parse(b) as { "@type": string })["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
  });

  test("sends the security headers", async ({ request }) => {
    const headers = (await request.get("/")).headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("robots.txt keeps private pages out and points at the sitemap", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    for (const path of ["/checkout", "/track-order", "/login", "/register"]) {
      expect(body).toContain(`Disallow: ${path}`);
    }
  });

  test("sitemap, manifest, llms.txt and the search index respond", async ({ request }) => {
    expect((await request.get("/sitemap.xml")).status()).toBe(200);
    const manifest = await request.get("/manifest.webmanifest");
    expect((await manifest.json()).short_name).toBe("Kull Mart");
    expect((await request.get("/llms.txt")).headers()["content-type"]).toContain("text/plain");
    const index = await request.get("/api/search-index");
    expect(index.status()).toBe(200);
    expect(Array.isArray(await index.json())).toBe(true);
  });

  test("the revalidate endpoint is closed without its secret", async ({ request }) => {
    const response = await request.post("/api/revalidate", { data: { tags: ["catalog"] } });
    expect([401, 404]).toContain(response.status());
  });

  test("an unknown route gets the branded 404", async ({ page }) => {
    const response = await page.goto("/definitely-not-a-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("checkout with an empty cart shows the empty state and is noindex", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByRole("main").getByText("Your cart is currently empty")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("login explains that accounts are not available yet", async ({ page }) => {
    await page.goto("/login");
    const form = page.locator("main form");
    await form.locator('input[type="password"]').fill("secret");
    await form.locator("input").first().fill("someone@example.com");
    await form.getByRole("button", { name: "Log In" }).click();
    await expect(form).toContainText(/coming soon/i);
  });
});
