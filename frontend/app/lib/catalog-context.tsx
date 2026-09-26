"use client";

import { createContext, useContext, useMemo } from "react";
import { BRAND_INFO, type BrandInfo } from "./brand";
import type { CategoryInfo, Product } from "./types";

/**
 * The catalogue and brand contact details, fetched on the server (see lib/site-data.ts) and provided by the root
 * layout so client components read them here instead of importing static data.
 */
interface CatalogContextType {
  products: Product[];
  /** Regular in-stock catalogue: everything except pre-order items. */
  stockProducts: Product[];
  preorderProducts: Product[];
  categories: CategoryInfo[];
  /** True when the API was unreachable, so empty lists mean "unavailable" rather than "nothing for sale". */
  catalogFailed: boolean;
  brand: BrandInfo;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

interface CatalogProviderProps {
  products: Product[];
  categories: CategoryInfo[];
  failed: boolean;
  brand: BrandInfo;
  children: React.ReactNode;
}

export function CatalogProvider({ products, categories, failed, brand, children }: CatalogProviderProps) {
  const value = useMemo<CatalogContextType>(
    () => ({
      products,
      stockProducts: products.filter((p) => !p.isPreOrder),
      preorderProducts: products.filter((p) => p.isPreOrder),
      categories,
      catalogFailed: failed,
      brand,
    }),
    [products, categories, failed, brand],
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
