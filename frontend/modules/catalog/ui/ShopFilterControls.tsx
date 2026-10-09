"use client";

import { Layers, Sparkles } from "lucide-react";
import { useCatalog, useProducts } from "../context";
import { useLang } from "@/lib/i18n";
import {
  PRICE_STEP,
  appliesCollection,
  priceBounds,
  type FilterChange,
  type FilterState,
} from "../domain/shop-filters";
import type { T } from "@/lib/types";
import { FilterSelect } from "./FilterSelect";

const ALL_ITEMS: T = { en: "All items", bn: "সব আইটেম" };

const COLLECTIONS: { id: string; label: T }[] = [
  { id: "all", label: { en: "All drops", bn: "সব পণ্য" } },
  { id: "trending", label: { en: "Trending now", bn: "চলতি ট্রেন্ডিং" } },
  { id: "sale", label: { en: "On sale & deals", bn: "ছাড়যুক্ত পণ্য" } },
  { id: "new", label: { en: "New arrivals", bn: "নতুন আগমন" } },
];

interface ShopFilterControlsProps {
  filters: FilterState;
  onFilterChange: FilterChange;
}

/** The filter widgets themselves; rendered inside both the desktop sidebar and mobile drawer. */
export function ShopFilterControls({ filters, onFilterChange }: ShopFilterControlsProps) {
  const { t, ui, money } = useLang();
  const { categories } = useCatalog();
  const { stockProducts, preorderProducts } = useProducts();
  const isPreorderShop = filters.stockType === "preorder";
  const { min: minPrice, max: maxPrice } = priceBounds(isPreorderShop ? preorderProducts : stockProducts);

  // Stock or pre-order is decided by the link that led here (`?type=`), not by the visitor: the shop
  // stays inside one catalogue, and so does its category list.
  const visibleCategories = categories.filter((c) => c.type === (isPreorderShop ? "preorder" : "stock"));
  const selectedCategory = categories.find((c) => c.id === filters.category);
  const collections = isPreorderShop ? COLLECTIONS.filter((c) => c.id !== "sale") : COLLECTIONS;
  const activeCollection = appliesCollection(filters, filters.collection) ? filters.collection : "all";
  const selectedCollection = collections.find((c) => c.id === activeCollection) ?? COLLECTIONS[0]!;

  const sliderValue = Math.min(filters.maxPrice, maxPrice);
  const pricePercentage = Math.min(100, Math.max(0, ((sliderValue - minPrice) / (maxPrice - minPrice)) * 100));

  return (
    <div className="space-y-6 text-xs text-fg">
      <div className="relative">
        <div className="mb-2 flex items-center justify-between">
          <h5 className="text-2xs font-bold tracking-wider text-gold-800">{ui("filterCategories")}</h5>
          {filters.category !== "all" && (
            <button
              type="button"
              onClick={() => onFilterChange("category", "all")}
              className="cursor-pointer text-2xs text-fg-subtle underline hover:text-gold-800"
            >
              {ui("filterClearShort")}
            </button>
          )}
        </div>

        <FilterSelect
          defaultOpen
          icon={<Layers className="h-4 w-4 shrink-0 text-gold-700" />}
          triggerLabel={t(selectedCategory?.name ?? ALL_ITEMS)}
          options={[
            { id: "all", label: ui("filterAllCollections") },
            ...visibleCategories.map((cat) => ({ id: cat.id, label: t(cat.name) })),
          ]}
          value={filters.category}
          onChange={(id) => onFilterChange("category", id)}
        />
      </div>

      <FilterSelect
        icon={<Sparkles className="h-4 w-4 shrink-0 text-gold-700" />}
        triggerLabel={t(selectedCollection.label)}
        options={collections.map((c) => ({ id: c.id, label: t(c.label) }))}
        value={activeCollection}
        onChange={(id) => onFilterChange("collection", id)}
      />

      <div className="pt-1">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider text-fg">{ui("filterPriceRange")}</span>
          <span className="text-xs font-bold text-gold-800">
            {!Number.isFinite(filters.maxPrice) ? ui("filterAny") : money(filters.maxPrice)}
          </span>
        </div>

        <div className="relative flex items-center py-1">
          <input
            type="range"
            aria-label={ui("filterPriceRange")}
            min={minPrice}
            max={maxPrice}
            step={PRICE_STEP}
            value={sliderValue}
            onChange={(e) => {
              const next = Number(e.target.value);
              onFilterChange("maxPrice", next >= maxPrice ? Number.POSITIVE_INFINITY : next);
            }}
            className="h-2 w-full cursor-pointer appearance-none rounded-full accent-gold-500"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pricePercentage}%, var(--surface-strong) ${pricePercentage}%, var(--surface-strong) 100%)`,
            }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs font-medium text-fg-subtle">
          <span>{money(minPrice)}</span>
          <span>{money(maxPrice)}</span>
        </div>
      </div>

      {!isPreorderShop && (
        <div className="border-t border-ink-200 pt-3">
          <label className="flex cursor-pointer select-none items-center gap-2.5">
            <input
              type="checkbox"
              checked={filters.inStockOnly}
              onChange={(e) => onFilterChange("inStockOnly", e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-gold-500 accent-gold-500 focus:ring-gold-500"
            />
            <span className="text-xs font-semibold text-ink-800">{ui("filterInStockOnly")}</span>
          </label>
        </div>
      )}
    </div>
  );
}
