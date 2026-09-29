"use client";

import { createContext, useContext, useMemo } from "react";
import { BRAND_INFO, type BrandInfo } from "@/lib/brand";
import type { CategoryInfo, Product } from "@/lib/types";

/**
 * Two contexts, split on purpose so the site shell stays small:
 *  - Catalog (root layout): categories, brand and the failed flag. A few KB, needed by the header and footer.
 *  - Products (only the pages that list products): the full product models. Everything else uses the
 *    search index (lib/useSearchIndex.ts) or props from its own server page.
 * Both are fetched on the server (see lib/site-data.ts).
 */
interface CatalogContextType {
  categories: CategoryInfo[];
  /** True when the API was unreachable, so empty lists mean "unavailable" rather than "nothing for sale". */
  catalogFailed: boolean;
  brand: BrandInfo;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

interface CatalogProviderProps {
  categories: CategoryInfo[];
  failed: boolean;
  brand: BrandInfo;
  children: React.ReactNode;
}

export function CatalogProvider({ categories, failed, brand, children }: CatalogProviderProps) {
  const value = useMemo<CatalogContextType>(
    () => ({ categories, catalogFailed: failed, brand }),
    [categories, failed, brand],
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextType {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}

/** Contact details for the footer, floating buttons, order screens and policies. */
export function useBrand(): BrandInfo {
  const ctx = useContext(CatalogContext);
  return ctx?.brand ?? BRAND_INFO;
}

interface ProductsContextType {
  products: Product[];
  /** Regular in-stock catalogue: everything except pre-order items. */
  stockProducts: Product[];
  preorderProducts: Product[];
}

const ProductsContext = createContext<ProductsContextType | null>(null);

/** Wrap the content of a page that lists products; the page (a server component) supplies `products`. */
export function ProductsProvider({ products, children }: { products: Product[]; children: React.ReactNode }) {
  const value = useMemo<ProductsContextType>(
    () => ({
      products,
      stockProducts: products.filter((p) => !p.isPreOrder),
      preorderProducts: products.filter((p) => p.isPreOrder),
    }),
    [products],
  );
  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts(): ProductsContextType {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used within ProductsProvider");
  return ctx;
}
