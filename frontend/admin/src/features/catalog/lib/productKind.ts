import type { Kind } from "@/hooks/use-kind"

import type { Category, Product } from "../types"

/** A product's kind is its category's. If that category is not in the list (deleted), its variants decide. */
export function productKind(product: Product, categories: Category[]): Kind {
  const category = categories.find((c) => c.id === product.category_id)
  if (category) return category.category_type
  return product.variants.some((v) => v.is_preorder_enabled) ? "preorder" : "stock"
}

export const productListPath = (kind: Kind) => (kind === "preorder" ? "/preorder_products" : "/products")
