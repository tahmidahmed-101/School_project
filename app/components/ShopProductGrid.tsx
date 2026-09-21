"use client";

import { useState } from "react";
import { SlidersHorizontal, LayoutGrid, List, RotateCcw, Package } from "lucide-react";
import type { Product } from "../lib/types";
import { useLang } from "../lib/i18n";
import { countActiveFilters, type FilterChange, type FilterState } from "../lib/shop-filters";
import { ProductCard } from "./ProductCard";
import { ProductListItem } from "./ProductListItem";
import { ScrollReveal, CardReveal } from "./Reveal";
import { FilterDropdown } from "./FilterDropdown";
import { SearchField } from "./SearchField";

interface ShopProductGridProps {
  products: Product[];
  filters: FilterState;
  onFilterChange: FilterChange;
  onReset: () => void;
  onOpenMobileFilter: () => void;
}

const VIEW_BUTTON_BASE = "cursor-pointer rounded-lg p-2 transition-all";
const viewButtonClass = (active: boolean) =>
  `${VIEW_BUTTON_BASE} ${
    active ? "shadow-xs bg-gold-500 font-bold text-ink-950" : "text-ink-500 hover:text-ink-900"
  }`;

export function ShopProductGrid({
  products,
  filters,
  onFilterChange,
  onReset,
  onOpenMobileFilter,
}: ShopProductGridProps) {
  const { ui, n } = useLang();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const activeFilterCount = countActiveFilters(filters);

  const sortOptions = [
    { value: "featured", label: ui("sortFeatured") },
    { value: "newest", label: ui("sortNewest") },
    { value: "name-asc", label: ui("sortNameAsc") },
    { value: "name-desc", label: ui("sortNameDesc") },
    { value: "price-asc", label: ui("sortPriceLow") },
    { value: "price-desc", label: ui("sortPriceHigh") },
    { value: "discount", label: ui("sortDiscount") },
  ];

  const sortDropdown = (className: string) => (
    <FilterDropdown
      value={filters.sort}
      onChange={(value) => onFilterChange("sort", value)}
      options={sortOptions}
      className={className}
    />
  );

  return (
    <div className="min-w-0 flex-1 space-y-4 sm:space-y-6">
      {/* Mobile control card */}
      <ScrollReveal y={16} duration={0.6} className="w-full lg:hidden">
        <div className="shadow-xs w-full space-y-2.5 rounded-2xl border border-ink-200/80 bg-white p-3.5">
          <SearchField
            className="w-full"
            value={filters.searchQuery}
            onChange={(value) => onFilterChange("searchQuery", value)}
            placeholder={ui("searchPlaceholderShort")}
          />

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenMobileFilter}
              className="shadow-xs flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-xs font-bold text-ink-900 transition-colors hover:border-gold-500 hover:text-gold-600"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-gold-600" />
              <span>
                {ui("filterMobileToggle")} {activeFilterCount > 0 && `(${n(activeFilterCount)})`}
              </span>
            </button>

            {sortDropdown("flex-[1.3]")}
          </div>
        </div>
      </ScrollReveal>

      {/* Desktop control bar */}
      <ScrollReveal y={16} duration={0.6} className="hidden w-full lg:block">
        <div className="shadow-xs flex w-full items-center justify-between gap-4 rounded-2xl border border-ink-200/80 bg-white p-4">
          <SearchField
            className="max-w-lg flex-1"
            value={filters.searchQuery}
            onChange={(value) => onFilterChange("searchQuery", value)}
            placeholder={ui("searchPlaceholderShort")}
          />

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink-500">{ui("sortLabel")}:</span>
              {sortDropdown("w-44")}
            </div>

            <div className="shadow-xs flex items-center rounded-xl border border-ink-200 bg-ink-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={viewButtonClass(viewMode === "grid")}
                aria-label="Grid view"
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={viewButtonClass(viewMode === "list")}
                aria-label="List view"
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </ScrollReveal>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-ink-500">
          {ui("filterShowing")}{" "}
          <strong className="text-sm font-bold text-ink-900">{n(products.length)}</strong>{" "}
          {ui("itemsFound")}
        </span>
      </div>

      {products.length === 0 ? (
        <ScrollReveal y={20} duration={0.6}>
          <div className="shadow-xs my-4 rounded-2xl border border-ink-200/80 bg-white p-12 text-center sm:p-16">
            <Package className="mx-auto mb-3 h-12 w-12 text-ink-300" />
            <h4 className="ts-display mb-2 text-lg font-bold text-ink-900 sm:text-xl">
              {ui("noProductsFound")}
            </h4>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gold-500 px-7 py-3 text-xs font-bold tracking-wider text-ink-950 shadow-md transition-colors hover:bg-gold-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{ui("resetFilters")}</span>
            </button>
          </div>
        </ScrollReveal>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
          {products.map((product, idx) => (
            <CardReveal key={product.id} delay={(idx % 3) * 0.06}>
              <ProductCard product={product} />
            </CardReveal>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product, idx) => (
            <ScrollReveal
              key={product.id}
              delay={Math.min((idx % 6) * 0.05, 0.25)}
              y={18}
              duration={0.6}
            >
              <ProductListItem product={product} />
            </ScrollReveal>
          ))}
        </div>
      )}
    </div>
  );
}
