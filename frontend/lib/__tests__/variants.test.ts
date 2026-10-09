import { describe, expect, it } from "vitest";
import { makeProduct, makeSku } from "@/tests/fixtures";
import {
  ORDER_QUANTITY_CAP,
  applyVariant,
  galleryFor,
  initialSelection,
  isSellable,
  isValueAvailable,
  missingOption,
  resolveVariant,
  selectValue,
  soleVariant,
  variantById,
} from "../variants";

const options = [
  {
    id: "colour",
    name: "Colour",
    values: [
      { id: "legacy:colour:black", value: "Black" },
      { id: "legacy:colour:red", value: "Red" },
    ],
  },
  {
    id: "size",
    name: "Size",
    values: [
      { id: "m", value: "M" },
      { id: "l", value: "L" },
    ],
  },
];
const BLACK = "legacy:colour:black";
const RED = "legacy:colour:red";

// Black/M and Black/L can be bought, Red/M exists but has no stock, Red/L was never made.
const skus = [
  makeSku({ id: "black-m", sku: "B-M", optionValueIds: [BLACK, "m"], title: "Black / M", price: 500 }),
  makeSku({ id: "black-l", sku: "B-L", optionValueIds: [BLACK, "l"], title: "Black / L", price: 520 }),
  makeSku({ id: "red-m", sku: "R-M", optionValueIds: [RED, "m"], title: "Red / M", price: 550, inStock: false }),
];
const product = makeProduct({ options, skuVariants: skus, defaultVariantId: "black-m" });
const simple = makeProduct({ skuVariants: [makeSku()] });

describe("isSellable", () => {
  it("needs stock, and room left on a pre-order", () => {
    expect(isSellable(makeSku())).toBe(true);
    expect(isSellable(makeSku({ inStock: false }))).toBe(false);
    expect(isSellable(makeSku({ isPreOrder: true, preorderStatus: "sold-out" }))).toBe(false);
    expect(isSellable(makeSku({ isPreOrder: true, maxPreorderQuantity: 5, currentPreorderQuantity: 5 }))).toBe(false);
    expect(isSellable(makeSku({ isPreOrder: true, maxPreorderQuantity: 5, currentPreorderQuantity: 4 }))).toBe(true);
  });
});

describe("soleVariant / variantById", () => {
  it("is the single SKU of a product without options", () => {
    expect(soleVariant(simple)?.id).toBe("sku-1");
  });

  it("is undefined when there is a choice to make, or nothing to sell", () => {
    expect(soleVariant(product)).toBeUndefined();
    expect(soleVariant(makeProduct())).toBeUndefined();
    expect(soleVariant(makeProduct({ skuVariants: skus }))).toBeUndefined();
  });

  it("finds a SKU by id only", () => {
    expect(variantById(product, "black-l")?.sku).toBe("B-L");
    expect(variantById(product, "nope")).toBeUndefined();
  });
});

describe("isValueAvailable", () => {
  it("offers every value that some sellable SKU has when nothing is picked", () => {
    expect(isValueAvailable(product, {}, "colour", BLACK)).toBe(true);
    expect(isValueAvailable(product, {}, "size", "l")).toBe(true);
  });

  it("refuses a value whose only SKUs are out of stock", () => {
    expect(isValueAvailable(product, {}, "colour", RED)).toBe(false);
  });

  it("refuses a value that does not go with what is picked in the other options", () => {
    const restocked = makeProduct({ options, skuVariants: skus.map((v) => ({ ...v, inStock: true })) });
    expect(isValueAvailable(restocked, { size: "m" }, "colour", RED)).toBe(true);
    expect(isValueAvailable(restocked, { size: "l" }, "colour", RED)).toBe(false);
    expect(isValueAvailable(restocked, { colour: RED }, "size", "l")).toBe(false);
  });

  it("ignores the pick in the option being asked about", () => {
    expect(isValueAvailable(product, { colour: BLACK, size: "m" }, "size", "l")).toBe(true);
  });
});

describe("resolveVariant", () => {
  it("resolves a complete pick to exactly that SKU", () => {
    expect(resolveVariant(product, { colour: BLACK, size: "l" })?.id).toBe("black-l");
    expect(resolveVariant(product, { colour: RED, size: "m" })?.id).toBe("red-m");
  });

  it("has no SKU for an unfinished pick", () => {
    expect(resolveVariant(product)).toBeUndefined();
    expect(resolveVariant(product, {})).toBeUndefined();
    expect(resolveVariant(product, { colour: BLACK })).toBeUndefined();
  });

  it("never falls back to another SKU for a combination that was not made", () => {
    expect(resolveVariant(product, { colour: RED, size: "l" })).toBeUndefined();
    expect(resolveVariant(product, { colour: "green", size: "m" })).toBeUndefined();
  });

  it("uses the single SKU of a product without options, and none when there is no single one", () => {
    expect(resolveVariant(simple)?.id).toBe("sku-1");
    expect(resolveVariant(makeProduct())).toBeUndefined();
    expect(resolveVariant(makeProduct({ skuVariants: skus }))).toBeUndefined();
  });
});

describe("initialSelection", () => {
  it("picks nothing when more than one SKU can be bought", () => {
    expect(initialSelection(product)).toEqual({});
  });

  it("picks the only sellable SKU", () => {
    const oneLeft = makeProduct({ options, skuVariants: [skus[1]!, skus[2]!] });
    expect(initialSelection(oneLeft)).toEqual({ colour: BLACK, size: "l" });
  });

  it("fills in an option that has a single value", () => {
    const oneColour = makeProduct({
      options: [{ ...options[0]!, values: [options[0]!.values[0]!] }, options[1]!],
      skuVariants: [skus[0]!, skus[1]!],
    });
    expect(initialSelection(oneColour)).toEqual({ colour: BLACK });
  });

  it("is empty for a product without options", () => {
    expect(initialSelection(simple)).toEqual({});
  });
});

describe("selectValue / missingOption", () => {
  it("adds an available value", () => {
    expect(selectValue(product, {}, "size", "m")).toEqual({ size: "m" });
  });

  it("leaves the selection alone for an unavailable value", () => {
    const before = { size: "l" };
    expect(selectValue(product, before, "colour", RED)).toBe(before);
  });

  it("clears a value that is tapped again", () => {
    expect(selectValue(product, { colour: BLACK, size: "m" }, "size", "m")).toEqual({ colour: BLACK });
  });

  it("names the first option still to be picked", () => {
    expect(missingOption(product, {})?.name).toBe("Colour");
    expect(missingOption(product, { colour: BLACK })?.name).toBe("Size");
    expect(missingOption(product, { colour: BLACK, size: "m" })).toBeUndefined();
    expect(missingOption(simple, {})).toBeUndefined();
  });
});

describe("galleryFor", () => {
  const withPhotos = makeProduct({
    options,
    skuVariants: skus,
    gallery: ["a.jpg", "black.jpg", "red-1.jpg", "red-2.jpg"],
    galleryByValue: { [BLACK]: ["black.jpg"], [RED]: ["red-1.jpg", "red-2.jpg"] },
  });

  it("keeps the product's order when nothing with photos is picked", () => {
    expect(galleryFor(withPhotos, {})).toEqual(withPhotos.gallery);
    expect(galleryFor(withPhotos, { size: "m" })).toEqual(withPhotos.gallery);
  });

  it("puts the picked value's photos first, each photo once", () => {
    expect(galleryFor(withPhotos, { colour: RED })).toEqual(["red-1.jpg", "red-2.jpg", "a.jpg", "black.jpg"]);
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
