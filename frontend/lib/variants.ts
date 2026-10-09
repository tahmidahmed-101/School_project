import { isPreOrderSoldOut } from "@/lib/product";
import type { Product, ProductOption, SkuVariant } from "@/lib/types";

/**
 * The API exposes only an in-stock flag, not a quantity. This is the per-line ceiling the cart and stepper allow;
 * real stock is enforced by the backend at checkout (an over-ask comes back as an error the form shows).
 */
export const ORDER_QUANTITY_CAP = 99;

/** option id -> picked value id */
export type OptionSelection = Record<string, string>;

/** Can be ordered right now: in stock, or an open pre-order that still has room. */
export function isSellable(variant: SkuVariant): boolean {
  return variant.inStock && !isPreOrderSoldOut(variant);
}

export function variantById(product: Product, variantId: string): SkuVariant | undefined {
  return product.skuVariants?.find((v) => v.id === variantId);
}

/** The one SKU of a product that has nothing to choose; undefined as soon as there is a choice to make. */
export function soleVariant(product: Product): SkuVariant | undefined {
  const variants = product.skuVariants ?? [];
  return !product.options?.length && variants.length === 1 ? variants[0] : undefined;
}

function agrees(variant: SkuVariant, options: ProductOption[], selection: OptionSelection, except?: string): boolean {
  return options.every((option) => {
    const picked = selection[option.id];
    return option.id === except || !picked || variant.optionValueIds.includes(picked);
  });
}

export function isValueAvailable(
  product: Product,
  selection: OptionSelection,
  optionId: string,
  valueId: string,
): boolean {
  const options = product.options ?? [];
  return (product.skuVariants ?? []).some(
    (v) => isSellable(v) && v.optionValueIds.includes(valueId) && agrees(v, options, selection, optionId),
  );
}

export function missingOption(product: Product, selection: OptionSelection): ProductOption | undefined {
  return product.options?.find((option) => !selection[option.id]);
}

/** Only a complete pick has a SKU: an unfinished or never-made combination is undefined, never a neighbouring SKU. */
export function resolveVariant(product: Product, selection: OptionSelection = {}): SkuVariant | undefined {
  const options = product.options ?? [];
  if (options.length === 0) return soleVariant(product);
  if (missingOption(product, selection)) return undefined;
  return (product.skuVariants ?? []).find(
    (v) => v.optionValueIds.length === options.length && agrees(v, options, selection),
  );
}

/** The only sellable SKU when there is exactly one; otherwise just the single-value options, which show as text. */
export function initialSelection(product: Product): OptionSelection {
  const sellable = (product.skuVariants ?? []).filter(isSellable);
  const only = sellable.length === 1 ? sellable[0] : undefined;
  const selection: OptionSelection = {};
  for (const option of product.options ?? []) {
    const value = only
      ? option.values.find((v) => only.optionValueIds.includes(v.id))
      : option.values.length === 1
        ? option.values[0]
        : undefined;
    if (value) selection[option.id] = value.id;
  }
  return selection;
}

/** A tap on a value: picked again it is cleared, an unavailable value changes nothing. */
export function selectValue(
  product: Product,
  selection: OptionSelection,
  optionId: string,
  valueId: string,
): OptionSelection {
  if (selection[optionId] === valueId) {
    return Object.fromEntries(Object.entries(selection).filter(([id]) => id !== optionId));
  }
  if (!isValueAvailable(product, selection, optionId, valueId)) return selection;
  return { ...selection, [optionId]: valueId };
}

export function galleryFor(product: Product, selection: OptionSelection): string[] {
  const own = (product.options ?? []).flatMap((option) => product.galleryByValue?.[selection[option.id] ?? ""] ?? []);
  return [...new Set([...own, ...product.gallery])];
}

/** The product as it looks with one SKU chosen: that SKU's price, availability and pre-order state. */
export function applyVariant(product: Product, variant: SkuVariant | undefined): Product {
  if (!variant) return product;
  return {
    ...product,
    sku: variant.sku,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    salePrice: variant.salePrice,
    inStock: variant.inStock,
    stockCount: variant.inStock ? ORDER_QUANTITY_CAP : 0,
    isPreOrder: variant.isPreOrder,
    preorderEndDate: variant.preorderEndDate,
    expectedDelivery: variant.expectedDelivery,
    preorderCloses: variant.preorderCloses,
    maxPreorderQuantity: variant.maxPreorderQuantity,
    currentPreorderQuantity: variant.currentPreorderQuantity,
    preorderStatus: variant.preorderStatus,
  };
}
