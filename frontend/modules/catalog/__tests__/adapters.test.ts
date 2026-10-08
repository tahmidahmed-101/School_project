import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ publicEnv: { apiUrl: "https://api.kullmart.com/api/v1/public" } }));

const { normalizeImageUrl, toCategoryInfo, toProduct } = await import("../data/adapters");

describe("normalizeImageUrl", () => {
  it("puts media paths on the API origin", () => {
    expect(normalizeImageUrl(" /media/uploads/a.jpg ")).toBe("https://api.kullmart.com/media/uploads/a.jpg");
  });

  it("keeps absolute URLs and static paths as they are", () => {
    expect(normalizeImageUrl("https://api.kullmart.com/media/b.jpg")).toBe("https://api.kullmart.com/media/b.jpg");
    expect(normalizeImageUrl("https://picsum.photos/seed/x/800")).toBe("https://picsum.photos/seed/x/800");
    expect(normalizeImageUrl("/catalog/c.jpg")).toBe("/catalog/c.jpg");
  });

  it("returns empty for blank input", () => {
    expect(normalizeImageUrl("  ")).toBe("");
  });
});

describe("toCategoryInfo", () => {
  const category = { id: "c1", name: "Shirts", slug: "shirts", parent_id: null, category_type: "stock" as const };

  it("takes the count and picture from the API when it sends them", () => {
    const info = toCategoryInfo({ ...category, product_count: 7, image: "/media/shirt.jpg" });

    expect(info.itemCount).toBe(7);
    expect(info.image).toBe("https://api.kullmart.com/media/shirt.jpg");
  });

  it("shows the placeholder for a counted category without a picture", () => {
    const info = toCategoryInfo({ ...category, product_count: 0, image: null });

    expect(info.itemCount).toBe(0);
    expect(info.image).toBe("brand/category-placeholder.png");
  });
});

describe("toProduct pre-order state", () => {
  const variant = (fields: Record<string, unknown>) => ({
    id: "v1",
    sku: "SKU-1",
    price: "1000.00",
    effective_price: "1000.00",
    compare_at_price: null,
    in_stock: false,
    color: "",
    size: "",
    is_preorder_enabled: true,
    is_preorder_active: false,
    is_preorder_upcoming: false,
    preorder_start_date: null,
    preorder_end_date: null,
    release_date: null,
    preorder_stock_limit: null,
    preordered_quantity: 0,
    preorder_remaining: null,
    ...fields,
  });
  const product = (fields: Record<string, unknown>, kind?: string) =>
    toProduct({ id: "p1", category_id: "c1", kind, name: "Boot", slug: "boot", variants: [variant(fields)] } as never, []);

  it("marks a pre-order that has not opened as upcoming and not buyable", () => {
    const shown = product({ is_preorder_upcoming: true, in_stock: true }, "preorder");
    expect(shown).toMatchObject({ kind: "preorder", isPreOrder: false, inStock: false, preorderStatus: "upcoming" });
  });

  it("sells an ended pre-order from stock, and calls it closed when there is none", () => {
    expect(product({ in_stock: true })).toMatchObject({ isPreOrder: false, inStock: true });
    expect(product({ in_stock: true }).preorderStatus).toBeUndefined();
    expect(product({ in_stock: false })).toMatchObject({ inStock: false, preorderStatus: "closed" });
  });
});
