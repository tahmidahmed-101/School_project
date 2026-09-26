"use client";

import { Check, Layers, Sparkles } from "lucide-react";
import { useCatalog } from "../lib/catalog-context";
import { useLang } from "../lib/i18n";
import { PRICE_STEP, priceBounds, type FilterChange, type FilterState, type StockType } from "../lib/shop-filters";
import type { T } from "../lib/types";
import { FilterSelect } from "./FilterSelect";

const ALL_ITEMS: T = { en: "All items", bn: "সব আইটেম" };

const STOCK_TITLE: T = { en: "Availability", bn: "প্রাপ্যতা" };

const STOCK_OPTIONS: { id: StockType; label: T }[] = [
  { id: "normal", label: { en: "Stock items", bn: "স্টক আইটেম" } },
  { id: "preorder", label: { en: "Pre-order items", bn: "প্রি-অর্ডার আইটেম" } },
];

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
  const { categories, products } = useCatalog();
  const { min: minPrice, max: maxPrice } = priceBounds(products);

  const selectedCategory = categories.find((c) => c.id === filters.category);
  const selectedCollection = COLLECTIONS.find((c) => c.id === filters.collection) ?? COLLECTIONS[0]!;

  const sliderValue = Math.min(filters.maxPrice, maxPrice);
  const pricePercentage = Math.min(100, Math.max(0, ((sliderValue - minPrice) / (maxPrice - minPrice)) * 100));

  return (
    <div className="space-y-6 text-xs text-ink-900">
      <div role="radiogroup" aria-label={t(STOCK_TITLE)} className="space-y-2">
        <h5 className="text-[11px] font-bold tracking-wider text-gold-700">{t(STOCK_TITLE)}</h5>
        {STOCK_OPTIONS.map((opt) => {
          const checked = filters.stockType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onFilterChange("stockType", opt.id)}
              className="flex w-full cursor-pointer select-none items-center gap-2.5 text-left"
            >
              <span
                className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  checked ? "border-gold-500 bg-gold-500 text-white" : "border-ink-300 bg-white"
                }`}
              >
                {checked && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className={`text-xs font-semibold ${checked ? "text-gold-700" : "text-ink-800"}`}>
                {t(opt.label)}
              </span>
            </button>
          );
        })}
      </div>

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
            ...categories.map((cat) => ({ id: cat.id, label: t(cat.name) })),
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
            {!Number.isFinite(filters.maxPrice) ? ui("filterAny") : money(filters.maxPrice)}
          </span>
        </div>

        <div className="relative flex items-center py-1">
          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            step={PRICE_STEP}
            value={sliderValue}
            onChange={(e) => {
              const next = Number(e.target.value);
              onFilterChange("maxPrice", next >= maxPrice ? Number.POSITIVE_INFINITY : next);
            }}
            className="h-2 w-full cursor-pointer appearance-none rounded-full accent-gold-500 focus:outline-none"
            style={{
              background: `linear-gradient(to right, #e5c04c 0%, #e5c04c ${pricePercentage}%, #dbe4d8 ${pricePercentage}%, #dbe4d8 100%)`,
            }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs font-medium text-ink-500">
          <span>{money(minPrice)}</span>
          <span>{money(maxPrice)}</span>
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
