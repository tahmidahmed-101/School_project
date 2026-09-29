import { describe, expect, it } from "vitest";
import { makeProduct, makeSku } from "@/tests/fixtures";
import { ORDER_QUANTITY_CAP, applyVariant, defaultVariant, resolveVariant, selectionFor } from "../variants";

const skus = [
  makeSku({ id: "black-m", sku: "B-M", color: "Black", size: "M", price: 500 }),
  makeSku({ id: "black-l", sku: "B-L", color: "Black", size: "L", price: 520 }),
  makeSku({ id: "red-m", sku: "R-M", color: "Red", size: "M", price: 550, inStock: false }),
];
const product = makeProduct({ skuVariants: skus, defaultVariantId: "black-l" });

describe("selectionFor", () => {
  it("builds the option-group record and skips empty options", () => {
    expect(selectionFor(skus[0]!)).toEqual({ Colour: "Black", Size: "M" });
    expect(selectionFor(makeSku({ color: "Red" }))).toEqual({ Colour: "Red" });
    expect(selectionFor(makeSku())).toEqual({});
  });
});

describe("defaultVariant / resolveVariant", () => {
  it("uses defaultVariantId, falling back to the first SKU", () => {
    expect(defaultVariant(product)?.id).toBe("black-l");
    expect(defaultVariant(makeProduct({ skuVariants: skus }))?.id).toBe("black-m");
  });

  it("returns undefined when the product has no SKUs", () => {
    expect(resolveVariant(makeProduct())).toBeUndefined();
  });

  it("resolves an exact colour + size match", () => {
    expect(resolveVariant(product, { Colour: "Black", Size: "M" })?.id).toBe("black-m");
    expect(resolveVariant(product, { Colour: "Red", Size: "M" })?.id).toBe("red-m");
  });

  it("falls back to the same colour when the size does not exist, then to the default", () => {
    expect(resolveVariant(product, { Colour: "Black", Size: "XL" })?.id).toBe("black-m");
    expect(resolveVariant(product, { Colour: "Green", Size: "M" })?.id).toBe("black-l");
    expect(resolveVariant(product, {})?.id).toBe("black-l");
  });
});

describe("applyVariant", () => {
  it("applies the SKU's price, sku and stock", () => {
    const shown = applyVariant(product, skus[1]);
    expect(shown.price).toBe(520);
    expect(shown.sku).toBe("B-L");
    expect(shown.inStock).toBe(true);
    expect(shown.stockCount).toBe(ORDER_QUANTITY_CAP);
  });

  it("marks an out-of-stock SKU as having no stock", () => {
    const shown = applyVariant(product, skus[2]);
    expect(shown.inStock).toBe(false);
    expect(shown.stockCount).toBe(0);
  });

  it("returns the product unchanged without a variant", () => {
    expect(applyVariant(product, undefined)).toBe(product);
  });
});
