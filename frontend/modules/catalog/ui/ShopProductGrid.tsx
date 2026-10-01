"use client";

import { useState } from "react";
import { SlidersHorizontal, LayoutGrid, List, Package } from "lucide-react";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { countActiveFilters, type FilterChange, type FilterState } from "../domain/shop-filters";
import { ProductCardGrid } from "./ProductCardGrid";
import { ProductListItem } from "./ProductListItem";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { FilterDropdown } from "./FilterDropdown";
import { SearchField } from "./SearchField";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { Button } from "@/design-system/ui/Button";

// Rendering every match made shop cost grow with the catalogue; filters still search the full list.
const PAGE_SIZE = 24;

interface ShopProductGridProps {
  products: Product[];
  /** The catalogue could not be loaded (API unreachable): say so instead of "no results". */
  unavailable?: boolean;
  filters: FilterState;
  onFilterChange: FilterChange;
  onReset: () => void;
  onOpenMobileFilter: () => void;
}

const VIEW_BUTTON_BASE = "cursor-pointer rounded-full p-2 transition-all";
const viewButtonClass = (active: boolean) =>
  `${VIEW_BUTTON_BASE} ${active ? "shadow-xs bg-gold-500 font-bold text-ink-950" : "text-ink-500 hover:text-ink-900"}`;

export function ShopProductGrid({
  products,
  unavailable = false,
  filters,
  onFilterChange,
  onReset,
  onOpenMobileFilter,
}: ShopProductGridProps) {
  const { ui, n } = useLang();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [shownFor, setShownFor] = useState(products);
  if (shownFor !== products) {
    setShownFor(products);
    setShown(PAGE_SIZE);
  }
  const visible = products.slice(0, shown);

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
      <div className="w-full lg:hidden">
        <div className="shadow-xs w-full space-y-2.5 rounded-2xl border border-ink-200/80 bg-white p-3.5">
          <SearchField
            className="w-full"
            value={filters.searchQuery}
            onChange={(value) => onFilterChange("searchQuery", value)}
            placeholder={ui("searchPlaceholder")}
          />

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenMobileFilter}
              className="shadow-xs flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-xs font-bold text-ink-900 transition-colors hover:border-gold-500 hover:text-gold-800"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-gold-700" />
              <span>
                {ui("filterMobileToggle")} {activeFilterCount > 0 && `(${n(activeFilterCount)})`}
              </span>
            </button>

            {sortDropdown("flex-[1.3]")}
          </div>
        </div>
      </div>

      {/* Desktop control bar */}
      <div className="hidden w-full lg:block">
        <div className="shadow-xs flex w-full items-center justify-between gap-4 rounded-2xl border border-ink-200/80 bg-white p-4">
          <SearchField
            className="max-w-lg flex-1"
            value={filters.searchQuery}
            onChange={(value) => onFilterChange("searchQuery", value)}
            placeholder={ui("searchPlaceholder")}
          />

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink-500">{ui("sortLabel")}:</span>
              {sortDropdown("w-44")}
            </div>

            <div
              role="group"
              aria-label={ui("viewMode")}
              className="shadow-xs flex items-center rounded-full border border-ink-200 bg-ink-50 p-0.5"
            >
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={viewButtonClass(viewMode === "grid")}
                aria-pressed={viewMode === "grid"}
                aria-label={ui("gridView")}
                title={ui("gridView")}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={viewButtonClass(viewMode === "list")}
                aria-pressed={viewMode === "list"}
                aria-label={ui("listView")}
                title={ui("listView")}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-ink-500">
          {ui("filterShowing")} <strong className="text-sm font-bold text-ink-900">{n(products.length)}</strong>{" "}
          {ui("itemsFound")}
        </span>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package className="mx-auto mb-3 h-12 w-12 text-ink-300" />}
          title={unavailable ? ui("catalogUnavailable") : ui("noProductsFound")}
          onReset={onReset}
        />
      ) : viewMode === "grid" ? (
        <ProductCardGrid
          products={visible}
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
          stagger={0.05}
          eagerCount={4}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((product, idx) => (
            <ScrollReveal key={product.id} delay={Math.min((idx % 6) * 0.05, 0.25)} y={18} duration={0.6}>
              <ProductListItem product={product} />
            </ScrollReveal>
          ))}
        </div>
      )}

      {shown < products.length && (
        <div className="flex justify-center pt-2">
          <Button size="lg" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            {ui("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
