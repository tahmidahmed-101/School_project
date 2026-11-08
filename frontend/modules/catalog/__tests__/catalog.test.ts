import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCategory, ApiProduct } from "@/lib/api/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ publicEnv: { apiUrl: "https://api.schoolproject.com/api/v1/public" } }));

const queries = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listAllProducts: vi.fn(),
  getProduct: vi.fn(),
  getProductReviews: vi.fn(),
  getRelatedProducts: vi.fn(),
  getBundle: vi.fn(),
}));
vi.mock("../data/queries", () => queries);

const { getCatalog, getProductBySlug, getRelatedProductsBySlug, getShellCatalog } = await import("../data/catalog");

const category = (id: string, categoryType: ApiCategory["category_type"]): ApiCategory => ({
  id,
  name: id,
  slug: id,
  parent_id: null,
  category_type: categoryType,
  product_count: 1,
});

const product = (slug: string, kind: ApiProduct["kind"], categoryId: string): ApiProduct =>
  ({ id: slug, category_id: categoryId, kind, name: slug, slug, variants: [], images: [] }) as unknown as ApiProduct;

// A row the API should no longer send; the storefront must still drop it.
const OTHER = "other" as unknown as "stock";

const categories = [category("bags", "stock"), category("gadgets", OTHER)];

describe("catalogue reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.listCategories.mockResolvedValue(categories);
    queries.getProductReviews.mockResolvedValue(null);
  });

  it("lists stock products and stock categories only", async () => {
    queries.listAllProducts.mockResolvedValue([product("tote", "stock", "bags"), product("buds", OTHER, "gadgets")]);
    const catalog = await getCatalog();
    expect(catalog.products.map((p) => p.slug)).toEqual(["tote"]);
    expect(catalog.categories.map((c) => c.slug)).toEqual(["bags"]);
    expect((await getShellCatalog()).categories.map((c) => c.slug)).toEqual(["bags"]);
  });

  it("treats a product that is not a stock item as not found", async () => {
    queries.getProduct.mockResolvedValueOnce(product("buds", OTHER, "gadgets"));
    expect(await getProductBySlug("buds")).toBeNull();
    queries.getProduct.mockResolvedValueOnce(product("tote", "stock", "bags"));
    expect((await getProductBySlug("tote"))?.slug).toBe("tote");
  });

  it("drops related picks that are not stock items", async () => {
    queries.getRelatedProducts.mockResolvedValue([product("tote", "stock", "bags"), product("buds", OTHER, "gadgets")]);
    expect((await getRelatedProductsBySlug("wallet", 4))?.map((p) => p.slug)).toEqual(["tote"]);
  });
});
