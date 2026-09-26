import type { Product, SkuVariant } from "./types";

/**
 * Bridge between the storefront's option-group model (Colour / Size pickers, `selectedVariant` records)
 * and the backend's SKU variants (one row per colour/size combination, with its own price and stock).
 */

/** English group names double as the keys of `selectedVariant` records. */
export const COLOUR_GROUP = "Colour";
export const SIZE_GROUP = "Size";

/**
 * The API exposes only an in-stock flag, not a quantity. This is the per-line ceiling the cart and stepper allow;
 * real stock is enforced by the backend at checkout (an over-ask comes back as an error the form shows).
 */
export const ORDER_QUANTITY_CAP = 99;

/** The option-group selection that identifies a SKU, e.g. { Colour: "Black", Size: "M" }. */
export function selectionFor(variant: SkuVariant): Record<string, string> {
  const selection: Record<string, string> = {};
  if (variant.color) selection[COLOUR_GROUP] = variant.color;
  if (variant.size) selection[SIZE_GROUP] = variant.size;
  return selection;
}

export function defaultVariant(product: Product): SkuVariant | undefined {
  const variants = product.skuVariants ?? [];
  return variants.find((v) => v.id === product.defaultVariantId) ?? variants[0];
}

/**
 * The SKU a selection points at. With no selection it is the default SKU. If the chosen combination does not
 * exist (e.g. Black + XL was never made) it falls back to the first SKU that shares the colour, then the default.
 */
export function resolveVariant(
  product: Product,
  selected?: Record<string, string>,
): SkuVariant | undefined {
  const variants = product.skuVariants ?? [];
  if (variants.length === 0) return undefined;
  if (!selected || Object.keys(selected).length === 0) return defaultVariant(product);

  const color = selected[COLOUR_GROUP];
  const size = selected[SIZE_GROUP];
  const matches = (v: SkuVariant, useSize: boolean) =>
    (color === undefined || v.color === color) && (!useSize || size === undefined || v.size === size);

  return (
    variants.find((v) => matches(v, true)) ??
    variants.find((v) => matches(v, false)) ??
    defaultVariant(product)
  );
}

/** The product as it looks with one SKU chosen: that SKU's price, availability and pre-order state. */
export function applyVariant(product: Product, variant: SkuVariant | undefined): Product {
  if (!variant) return product;
  return {
    ...product,
    sku: variant.sku,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    inStock: variant.inStock,
    stockCount: variant.inStock ? ORDER_QUANTITY_CAP : 0,
    isPreOrder: variant.isPreOrder,
    preorderEndDate: variant.preorderEndDate,
    expectedDelivery: variant.expectedDelivery,
    preorderCloses: variant.preorderCloses,
    preorderStatus: variant.preorderStatus,
  };
}

