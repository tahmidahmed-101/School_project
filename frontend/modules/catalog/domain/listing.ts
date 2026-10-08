import { productKind } from "@/lib/product";
import type { Product } from "@/lib/types";

/** "You may also like" for a product: the API's picks, else its own category, and only ever from its own shop. */
export function relatedForProduct(
  product: Product,
  apiPicks: Product[] | null,
  catalog: Product[],
  count: number,
): Product[] {
  const candidates = apiPicks ?? catalog.filter((p) => p.category === product.category);
  return candidates.filter((p) => p.id !== product.id && productKind(p) === productKind(product)).slice(0, count);
}

/**
 * A product as cards, filters and search need it. Listing pages send every product to the browser, so the parts
 * only the product page reads (extra photos, specs, highlights, the second copy of the description) are left out.
 */
export function forListing(product: Product): Product {
  return {
    ...product,
    longDescription: { en: "", bn: "" },
    gallery: [product.image],
    specs: undefined,
    highlights: undefined,
    metaKeywords: undefined,
  };
}
