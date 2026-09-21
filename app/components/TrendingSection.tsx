"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import type { Product } from "../lib/types";
import { CATEGORIES, PRODUCTS } from "../lib/data";
import { ProductCard } from "./ProductCard";
import { ScrollReveal, CardReveal } from "./Reveal";
import { useLang } from "../lib/i18n";

interface FilterTab {
  id: string;
  label: { en: string; bn: string };
  match: (p: Product) => boolean;
  link: string;
}

const FILTER_TABS: FilterTab[] = [
  {
    id: "all",
    label: { en: "All", bn: "সব" },
    match: () => true,
    link: "/shop",
  },
  ...CATEGORIES.map((category) => ({
    id: category.id,
    label: category.name,
    match: (p: Product) => p.category === category.id,
    link: `/shop?category=${category.slug}`,
  })),
];

export function TrendingSection() {
  const { ui, lang } = useLang();
  const [activeTabId, setActiveTabId] = useState<string>("all");

  const activeTab: FilterTab = useMemo(
    () => FILTER_TABS.find((tab) => tab.id === activeTabId) ?? (FILTER_TABS[0] as FilterTab),
    [activeTabId],
  );

  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter(activeTab.match);
  }, [activeTab]);

  return (
    <section className="border-b border-ink-200 bg-white py-8 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header: Title & View All */}
        <ScrollReveal className="mb-4 flex flex-nowrap items-center justify-between gap-2 sm:mb-6 sm:gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="ts-display truncate text-base font-bold tracking-tight text-gold-600 sm:text-2xl lg:text-3xl">
              {ui("featuredTitle")}
            </h2>
          </div>

          <Link
            href={activeTab.link}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-bold text-gold-600 transition-colors hover:text-gold-700 sm:text-sm"
          >
            <span>{ui("viewAllProducts")}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
          </Link>
        </ScrollReveal>

        {/* Filter tabs: same underline design on every screen; the row scrolls sideways inside the section width */}
        <ScrollReveal delay={0.05} className="mb-6 border-b border-ink-200/90 sm:mb-8">
          <div className="no-scrollbar flex items-center gap-6 overflow-x-auto sm:gap-8">
            {FILTER_TABS.map((tab) => {
              const isActive = activeTabId === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`-mb-px shrink-0 cursor-pointer whitespace-nowrap pb-3 text-sm font-semibold transition-colors duration-150 sm:text-[15px] ${
                    isActive
                      ? "border-b-2 border-gold-500 font-bold text-gold-600"
                      : "border-b-2 border-transparent text-ink-500 hover:text-ink-900"
                  }`}
                  aria-pressed={isActive}
                >
                  {tab.label[lang] || tab.label.en}
                </button>
              );
            })}
          </div>
        </ScrollReveal>

        {/* Product Grid for Filtered Items with CardReveal kinetic stagger */}
        {filteredProducts.length > 0 ? (
          <div
            key={activeTabId}
            className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4"
          >
            {filteredProducts.map((product, idx) => (
              <CardReveal key={product.id} delay={(idx % 4) * 0.08}>
                <ProductCard product={product} />
              </CardReveal>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-200 py-12 text-center text-ink-500">
            <SlidersHorizontal className="mx-auto h-8 w-8 text-ink-300" />
            <p className="mt-2 text-sm">{ui("noProductsFound")}</p>
            <button
              type="button"
              onClick={() => setActiveTabId("all")}
              className="mt-3 cursor-pointer text-xs font-bold text-gold-600 hover:underline"
            >
              {ui("resetFilters")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
