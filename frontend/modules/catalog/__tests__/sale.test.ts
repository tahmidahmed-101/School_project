import { describe, expect, it, vi } from "vitest";
import type { ApiCategory, ApiProduct, ApiVariant } from "@/lib/api/types";
import { getDiscountPercent, getSaleOffer } from "@/lib/product";
import { applyVariant } from "@/lib/variants";
import { DEFAULT_FILTERS, filterAndSortProducts } from "../domain/shop-filters";

vi.mock("@/lib/env", () => ({ publicEnv: { apiUrl: "https://api.kullmart.com/api/v1/public" } }));

const { toProduct } = await import("../data/adapters");

const categories: ApiCategory[] = [
  { id: "c1", name: "Bags", slug: "bags", parent_id: null, category_type: "stock", product_count: 1 },
];

const variant = (overrides: Partial<ApiVariant> = {}): ApiVariant => ({
  id: "v1",
  sku: "BAG-1",
  price: "1000.00",
  discount_price: null,
  effective_price: "1000.00",
  in_stock: true,
  components: [],
  is_bundle: false,
  is_preorder_enabled: false,
  preorder_price: null,
  preorder_start_date: null,
  preorder_end_date: null,
  release_date: null,
  is_preorder_active: false,
  is_preorder_upcoming: false,
  is_preorder_price_applied: false,
  preorder_stock_limit: null,
  preordered_quantity: 0,
  preorder_remaining: null,
  ...overrides,
});

const product = (overrides: Partial<ApiProduct> = {}): ApiProduct => ({
  id: "p1",
  category_id: "c1",
  kind: "stock",
  name: "Tote",
  slug: "tote",
  product_type: "simple",
  tagline: "",
  featured: false,
  trending: false,
  new_arrival: false,
  badge: "",
  specs: {},
  variants: [variant()],
  images: [],
  ...overrides,
});

const sale = { name: "Eid Sale", percent_off: "20.00", ends_at: "2026-10-17T17:59:59Z" };
const onSale = variant({ effective_price: "800.00", sale_price: "800.00" });

describe("toProduct with a sale", () => {
  it("carries the sale and the SKU's sale price", () => {
    const result = toProduct(product({ variants: [onSale], sale }), categories);

    expect(result.sale).toEqual({
      name: "Eid Sale",
      percentOff: 20,
      endsAt: { en: "17 Oct 2026", bn: "১৭ অক্টো, ২০২৬" },
    });
    expect(result.salePrice).toBe(800);
    expect(result.price).toBe(800);
    expect(result.compareAtPrice).toBe(1000);
    expect(getSaleOffer(result)).toBe(result.sale);
  });

  it("leaves the end date out for an open-ended sale", () => {
    const result = toProduct(product({ variants: [onSale], sale: { ...sale, ends_at: null } }), categories);
    expect(result.sale?.endsAt).toBeUndefined();
  });

  it("behaves as before when the API sends no sale fields", () => {
    const result = toProduct(product(), categories);

    expect(result.sale).toBeUndefined();
    expect(result.salePrice).toBeUndefined();
    expect(getSaleOffer(result)).toBeNull();
    expect(getDiscountPercent(result)).toBeNull();
  });

  it("names no sale on a SKU the sale leaves out", () => {
    const result = toProduct(product({ variants: [variant({ sale_price: null })], sale }), categories);
    expect(getSaleOffer(result)).toBeNull();
  });

  it("follows the chosen SKU", () => {
    const result = toProduct(product({ variants: [onSale, variant({ id: "v2", sku: "BAG-2" })], sale }), categories);
    const other = applyVariant(result, result.skuVariants?.[1]);

    expect(getSaleOffer(result)?.name).toBe("Eid Sale");
    expect(getSaleOffer(other)).toBeNull();
  });

  it("never shows a sale on a pre-order", () => {
    const preorder = variant({
      effective_price: "800.00",
      sale_price: "800.00",
      is_preorder_enabled: true,
      is_preorder_active: true,
    });
    const result = toProduct(product({ kind: "preorder", variants: [preorder], sale }), categories);
    const closed = toProduct(product({ kind: "preorder", variants: [onSale], sale }), categories);

    expect(result.salePrice).toBeUndefined();
    expect(getSaleOffer(result)).toBeNull();
    expect(getSaleOffer(closed)).toBeNull();
  });
});

describe("a price lowered by a sale counts as a discount", () => {
  const discounted = toProduct(product({ id: "sale", variants: [onSale], sale }), categories);
  const deeper = toProduct(
    product({
      id: "deeper",
      variants: [variant({ effective_price: "500.00", sale_price: "500.00" })],
      sale: { ...sale, percent_off: "50.00" },
    }),
    categories,
  );
  const full = toProduct(product({ id: "full" }), categories);
  const ids = (list: { id: string }[]) => list.map((p) => p.id);

  it("has a discount percentage", () => {
    expect(getDiscountPercent(discounted)).toBe(20);
  });

  it("is in the sale collection", () => {
    const listed = filterAndSortProducts([full, discounted], { ...DEFAULT_FILTERS, collection: "sale" });
    expect(ids(listed)).toEqual(["sale"]);
  });

  it("is ranked by the discount sort", () => {
    const listed = filterAndSortProducts([full, discounted, deeper], { ...DEFAULT_FILTERS, sort: "discount" });
    expect(ids(listed)).toEqual(["deeper", "sale", "full"]);
  });
});
