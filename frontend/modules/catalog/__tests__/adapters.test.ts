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

  it("names the parent of a subcategory by its slug", () => {
    const child = { ...category, id: "c2", slug: "polos", parent_id: "c1", product_count: 0, image: null };
    const all = [{ ...category, product_count: 0, image: null }, child];

    expect(toCategoryInfo(child, all).parentId).toBe("shirts");
    expect(toCategoryInfo(all[0]!, all).parentId).toBeUndefined();
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
    color: "Black",
    size: "M",
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
    toProduct(
      { id: "p1", category_id: "c1", kind, name: "Boot", slug: "boot", variants: [variant(fields)] } as never,
      [],
    );

  it("reads options only from the API's option fields, never from colour or size", () => {
    expect(product({ in_stock: true }).options).toBeUndefined();
    expect(product({ in_stock: true }).skuVariants?.[0]).toMatchObject({ optionValueIds: [], title: "" });
  });

  it("marks a pre-order that has not opened as upcoming and not buyable", () => {
    const shown = product({ is_preorder_upcoming: true, in_stock: true }, "preorder");
    expect(shown).toMatchObject({ kind: "preorder", isPreOrder: false, inStock: false, preorderStatus: "upcoming" });
  });

  it("sells an ended pre-order from stock, and calls it closed when there is none", () => {
    expect(product({ in_stock: true })).toMatchObject({ isPreOrder: false, inStock: true });
    expect(product({ in_stock: true }).preorderStatus).toBeUndefined();
    expect(product({ in_stock: false })).toMatchObject({ inStock: false, preorderStatus: "closed" });
  });

  it("never sells a pre-order product from stock once its window has ended", () => {
    const shown = product({ in_stock: true }, "preorder");
    expect(shown).toMatchObject({ kind: "preorder", isPreOrder: false, inStock: false, preorderStatus: "closed" });
    expect(shown.stockCount).toBe(0);
  });
});

describe("toProduct options", () => {
  const variant = (id: string, valueIds: string[], title: string) => ({
    id,
    sku: id.toUpperCase(),
    price: "1000.00",
    effective_price: "1000.00",
    in_stock: true,
    title,
    option_value_ids: valueIds,
  });
  const shown = toProduct(
    {
      id: "p1",
      category_id: "c1",
      kind: "stock",
      name: "Shirt",
      slug: "shirt",
      highlights: ["Pure cotton", ""],
      options: [
        {
          id: "legacy:colour",
          name: "Colour",
          values: [
            { id: "legacy:colour:red", value: "Red" },
            { id: "legacy:colour:blue", value: "Blue" },
          ],
        },
        { id: "o-size", name: "Size", values: [{ id: "v-m", value: "M" }] },
      ],
      variants: [
        variant("red-m", ["legacy:colour:red", "v-m"], "Red / M"),
        variant("blue-m", ["legacy:colour:blue", "v-m"], "Blue / M"),
      ],
      images: [
        { url: "/media/blue.jpg", alt_text: "", sort_order: 2, option_value_id: "legacy:colour:blue" },
        { url: "/media/front.jpg", alt_text: "", sort_order: 1, option_value_id: null },
      ],
    } as never,
    [],
  );

  it("carries the options in the API's order with their ids untouched", () => {
    expect(shown.options).toEqual([
      {
        id: "legacy:colour",
        name: "Colour",
        values: [
          { id: "legacy:colour:red", value: "Red" },
          { id: "legacy:colour:blue", value: "Blue" },
        ],
      },
      { id: "o-size", name: "Size", values: [{ id: "v-m", value: "M" }] },
    ]);
  });

  it("carries each SKU's value ids and title", () => {
    expect(shown.skuVariants?.map((v) => [v.optionValueIds, v.title])).toEqual([
      [["legacy:colour:red", "v-m"], "Red / M"],
      [["legacy:colour:blue", "v-m"], "Blue / M"],
    ]);
  });

  it("groups photos by the option value they belong to", () => {
    expect(shown.gallery).toEqual([
      "https://api.kullmart.com/media/front.jpg",
      "https://api.kullmart.com/media/blue.jpg",
    ]);
    expect(shown.galleryByValue).toEqual({ "legacy:colour:blue": ["https://api.kullmart.com/media/blue.jpg"] });
  });

  it("carries the highlights, leaving blank ones out", () => {
    expect(shown.highlights).toEqual([{ en: "Pure cotton", bn: "" }]);
  });
});
