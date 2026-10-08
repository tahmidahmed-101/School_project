import type { Product } from "@/lib/types";

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
