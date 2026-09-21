"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PRODUCTS, CATEGORIES } from "../lib/data";
import { useLang } from "../lib/i18n";
import {
  DEFAULT_FILTERS,
  filterAndSortProducts,
  type FilterChange,
  type FilterState,
} from "../lib/shop-filters";
import { ShopFilterSidebar } from "./ShopFilterSidebar";
import { ShopProductGrid } from "./ShopProductGrid";
import { ScrollReveal } from "./Reveal";
import { Breadcrumbs } from "./Breadcrumbs";

export function ShopCatalog() {
  const searchParams = useSearchParams();
  const { t, ui } = useLang();

  const [filters, setFilters] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    category: searchParams.get("category") || DEFAULT_FILTERS.category,
    collection: searchParams.get("collection") || DEFAULT_FILTERS.collection,
    sort: searchParams.get("sort") || DEFAULT_FILTERS.sort,
    searchQuery: searchParams.get("q") || DEFAULT_FILTERS.searchQuery,
  }));
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Keep filters in step with URL changes (e.g. clicking a category link while already on /shop)
  useEffect(() => {
    const category = searchParams.get("category");
    const collection = searchParams.get("collection");
    const sort = searchParams.get("sort");
    const searchQuery = searchParams.get("q");

    setFilters((prev) => ({
      ...prev,
      ...(category && { category }),
      ...(collection && { collection }),
      ...(sort && { sort }),
      ...(searchQuery && { searchQuery }),
    }));
  }, [searchParams]);

  const handleFilterChange: FilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const filteredProducts = useMemo(() => filterAndSortProducts(PRODUCTS, filters), [filters]);

  const activeCategory = CATEGORIES.find((c) => c.id === filters.category);
  const activeCategoryTitle = activeCategory ? t(activeCategory.name) : ui("shopHeading");

  return (
    <div className="min-h-screen w-full bg-ink-50/60">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <ScrollReveal className="mb-8 border-b border-ink-200 pb-6 sm:mb-10">
          <Breadcrumbs
            className="mb-4"
            items={
              filters.category !== "all"
                ? [
                    { label: ui("navShop"), href: "/shop" },
                    { label: activeCategoryTitle },
                  ]
                : [{ label: ui("navShop") }]
            }
          />
          <h1 className="ts-display text-3xl font-bold leading-tight tracking-tight text-gold-600 sm:text-4xl lg:text-5xl">
            {activeCategoryTitle}
          </h1>
        </ScrollReveal>

        <div className="flex flex-col items-start gap-8 lg:flex-row">
          <ShopFilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            isMobileOpen={isMobileFilterOpen}
            onMobileClose={() => setIsMobileFilterOpen(false)}
            productCount={filteredProducts.length}
          />

          <ShopProductGrid
            products={filteredProducts}
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            onOpenMobileFilter={() => setIsMobileFilterOpen(true)}
          />
        </div>
      </div>
    </div>
  );
}
