"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCatalog, useProducts } from "../context";
import { useLang } from "@/lib/i18n";
import {
  DEFAULT_FILTERS,
  filterAndSortProducts,
  type FilterChange,
  parseStockType,
  type FilterState,
} from "../domain/shop-filters";
import { ShopFilterSidebar } from "./ShopFilterSidebar";
import { ShopProductGrid } from "./ShopProductGrid";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";

export function ShopCatalog() {
  const searchParams = useSearchParams();
  const { t, ui } = useLang();
  const { categories, catalogFailed } = useCatalog();
  const { products } = useProducts();

  const [filters, setFilters] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    category: searchParams.get("category") || DEFAULT_FILTERS.category,
    collection: searchParams.get("collection") || DEFAULT_FILTERS.collection,
    sort: searchParams.get("sort") || DEFAULT_FILTERS.sort,
    searchQuery: searchParams.get("q") || DEFAULT_FILTERS.searchQuery,
    stockType: parseStockType(searchParams.get("type")),
  }));
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Keep filters in step with URL changes (e.g. clicking a category link while already on /shop)
  useEffect(() => {
    const category = searchParams.get("category");
    const collection = searchParams.get("collection");
    const sort = searchParams.get("sort");
    const searchQuery = searchParams.get("q");
    const type = searchParams.get("type");

    setFilters((prev) => ({
      ...prev,
      // Only follow the URL when it names a type, so the user's checkbox choice isn't overwritten.
      ...(type && { stockType: parseStockType(type) }),
      ...(category && { category }),
      ...(collection && { collection }),
      ...(sort && { sort }),
      ...(searchQuery && { searchQuery }),
    }));
  }, [searchParams]);

  // Reset clears the user's filters but stays on the same stock type (normal / pre-order).
  const resetFilters = () => setFilters((prev) => ({ ...DEFAULT_FILTERS, stockType: prev.stockType }));

  const handleFilterChange: FilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const filteredProducts = useMemo(() => filterAndSortProducts(products, filters), [products, filters]);

  const activeCategory = categories.find((c) => c.id === filters.category);
  const activeCategoryTitle = activeCategory
    ? t(activeCategory.name)
    : filters.stockType === "preorder"
      ? ui("navPreOrder")
      : ui("navShop");

  return (
    <div className="min-h-screen w-full bg-ink-50/60">
      <Container className="pb-24 pt-8 sm:pt-10">
        <PageHeader
          breadcrumbs={
            <Breadcrumbs
              className="mb-4"
              items={
                filters.category !== "all"
                  ? [{ label: ui("navShop"), href: "/shop" }, { label: activeCategoryTitle }]
                  : [{ label: ui("navShop") }]
              }
            />
          }
          title={activeCategoryTitle}
        />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <ShopFilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={() => resetFilters()}
            isMobileOpen={isMobileFilterOpen}
            onMobileClose={() => setIsMobileFilterOpen(false)}
            productCount={filteredProducts.length}
          />

          <ShopProductGrid
            products={filteredProducts}
            unavailable={catalogFailed}
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={() => resetFilters()}
            onOpenMobileFilter={() => setIsMobileFilterOpen(true)}
          />
        </div>
      </Container>
    </div>
  );
}
