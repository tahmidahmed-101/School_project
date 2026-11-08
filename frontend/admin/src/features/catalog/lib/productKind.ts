import type { Product, ProductOption } from "../types"

/**
 * The variants a product is said to have. One without options is sold as a single item: the
 * untitled variant that holds its price and stock is not counted.
 */
export const variantCount = (product: Pick<Product, "options" | "variants">): number =>
  (product.options ?? []).length === 0 && product.variants.length <= 1 ? 0 : product.variants.length

/** The options saved on a product; none for a product that is sold as a single item. */
export const savedOptionsOf = (product: Product | null): ProductOption[] =>
  Array.isArray(product?.options) ? product.options : []
