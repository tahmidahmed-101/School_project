import type { Kind } from "@/hooks/use-kind"

import type { Category, Product, ProductOption } from "../types"

/** A product's kind is its category's. If that category is not in the list (deleted), its variants decide. */
export function productKind(product: Product, categories: Category[]): Kind {
  const category = categories.find((c) => c.id === product.category_id)
  if (category) return category.category_type
  return product.variants.some((v) => v.is_preorder_enabled) ? "preorder" : "stock"
}

export const productListPath = (kind: Kind) => (kind === "preorder" ? "/preorder_products" : "/products")

/**
 * The variants a product is said to have. One without options is sold as a single item: the
 * untitled variant that holds its price and stock is not counted.
 */
export const variantCount = (product: Pick<Product, "options" | "variants">): number =>
  (product.options ?? []).length === 0 && product.variants.length <= 1 ? 0 : product.variants.length

/** The options saved on a product; none for a product that is sold as a single item. */
export const savedOptionsOf = (product: Product | null): ProductOption[] =>
  Array.isArray(product?.options) ? product.options : []
