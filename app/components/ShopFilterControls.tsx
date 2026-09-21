"use client";

import { Layers, Sparkles } from "lucide-react";
import { CATEGORIES } from "../lib/data";
import { useLang } from "../lib/i18n";
import { MAX_PRICE, MIN_PRICE, type FilterChange, type FilterState } from "../lib/shop-filters";
import type { T } from "../lib/types";
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

  const selectedCategory = CATEGORIES.find((c) => c.id === filters.category);
  const selectedCollection = COLLECTIONS.find((c) => c.id === filters.collection) ?? COLLECTIONS[0]!;

  const pricePercentage = Math.min(
    100,
    Math.max(0, ((filters.maxPrice - MIN_PRICE) / (MAX_PRICE - MIN_PRICE)) * 100),
  );

  return (
    <div className="space-y-6 text-xs text-ink-900">
      <div className="relative">
        <div className="mb-2 flex items-center justify-between">
          <h5 className="text-[11px] font-bold tracking-wider text-gold-700">
            {ui("filterCategories")}
          </h5>
          {filters.category !== "all" && (
            <button
              type="button"
              onClick={() => onFilterChange("category", "all")}
              className="cursor-pointer text-[10px] text-ink-500 underline hover:text-gold-600"
            >
              {ui("filterClearShort")}
            </button>
          )}
        </div>

        <FilterSelect
          defaultOpen
          icon={<Layers className="h-4 w-4 shrink-0 text-gold-600" />}
          triggerLabel={t(selectedCategory?.name ?? ALL_ITEMS)}
          options={[
            { id: "all", label: ui("filterAllCollections") },
            ...CATEGORIES.map((cat) => ({ id: cat.id, label: t(cat.name) })),
          ]}
          value={filters.category}
          onChange={(id) => onFilterChange("category", id)}
        />
      </div>

      <FilterSelect
        icon={<Sparkles className="h-4 w-4 shrink-0 text-gold-600" />}
        triggerLabel={t(selectedCollection.label)}
        options={COLLECTIONS.map((c) => ({ id: c.id, label: t(c.label) }))}
        value={filters.collection}
        onChange={(id) => onFilterChange("collection", id)}
      />

      <div className="pt-1">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider text-ink-900">
            {ui("filterPriceRange")}
          </span>
          <span className="text-xs font-bold text-gold-600">
            {filters.maxPrice >= MAX_PRICE ? ui("filterAny") : money(filters.maxPrice)}
          </span>
        </div>

        <div className="relative flex items-center py-1">
          <input
            type="range"
            min={MIN_PRICE}
            max={MAX_PRICE}
            step={50}
            value={filters.maxPrice}
            onChange={(e) => onFilterChange("maxPrice", Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full accent-gold-500 focus:outline-none"
            style={{
              background: `linear-gradient(to right, #e5c04c 0%, #e5c04c ${pricePercentage}%, #dbe4d8 ${pricePercentage}%, #dbe4d8 100%)`,
            }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs font-medium text-ink-500">
          <span>{money(MIN_PRICE)}</span>
          <span>{money(MAX_PRICE)}</span>
        </div>
      </div>

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
    </div>
  );
}
