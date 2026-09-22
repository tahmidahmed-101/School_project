"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import type { Product } from "../lib/types";
import { CATEGORIES, PRODUCTS } from "../lib/data";
import { ProductCardGrid } from "./ProductCardGrid";
import { ScrollReveal } from "./Reveal";
import { EmptyState } from "./EmptyState";
import { useLang } from "../lib/i18n";

interface FilterTab {
  id: string;
  label: { en: string; bn: string };
  match: (p: Product) => boolean;
  link: string;
}

const ALL_TAB: FilterTab = {
  id: "all",
  label: { en: "All", bn: "সব" },
  match: () => true,
  link: "/shop",
};

interface TrendingSectionProps {
  /** Defaults to every non-pre-order product. */
  products?: Product[];
  title?: string;
  /** Hide the top-right "View all" link (e.g. when this section already shows the full catalogue). */
  showViewAllLink?: boolean;
}

export function TrendingSection({ products, title, showViewAllLink = true }: TrendingSectionProps) {
  const { ui, lang } = useLang();
  const [activeTabId, setActiveTabId] = useState<string>("all");

  const sourceProducts = useMemo(
    () => products ?? PRODUCTS.filter((p) => !p.isPreOrder),
    [products],
  );

  const filterTabs: FilterTab[] = useMemo(() => {
    const categoryIds = new Set(sourceProducts.map((p) => p.category));
    return [
      ALL_TAB,
      ...CATEGORIES.filter((category) => categoryIds.has(category.id)).map((category) => ({
        id: category.id,
        label: category.name,
        match: (p: Product) => p.category === category.id,
        link: `/shop?category=${category.slug}`,
      })),
    ];
  }, [sourceProducts]);

  const activeTab: FilterTab = useMemo(
    () => filterTabs.find((tab) => tab.id === activeTabId) ?? (filterTabs[0] as FilterTab),
    [activeTabId, filterTabs],
  );

  const filteredProducts = useMemo(() => {
    return sourceProducts.filter(activeTab.match);
  }, [sourceProducts, activeTab]);

  return (
    <section className="border-b border-ink-200 bg-white py-8 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header: Title & View All */}
        <ScrollReveal className="mb-4 flex flex-nowrap items-center justify-between gap-2 sm:mb-6 sm:gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="ts-display truncate text-base font-bold tracking-tight text-gold-600 sm:text-2xl lg:text-3xl">
              {title ?? ui("featuredTitle")}
            </h2>
          </div>

          {showViewAllLink && (
            <Link
              href={activeTab.link}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-bold text-gold-600 transition-colors hover:text-gold-700 sm:text-sm"
            >
              <span>{ui("viewAllProducts")}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
            </Link>
          )}
        </ScrollReveal>

        {/* Filter tabs: same underline design on every screen; the row scrolls sideways inside the section width */}
        <ScrollReveal delay={0.05} className="mb-6 border-b border-ink-200/90 sm:mb-8">
          <div className="no-scrollbar flex items-center gap-6 overflow-x-auto sm:gap-8">
            {filterTabs.map((tab) => {
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
          <ProductCardGrid
            key={activeTabId}
            products={filteredProducts}
            className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4"
          />
        ) : (
          <EmptyState
            variant="inline"
            icon={<SlidersHorizontal className="mx-auto h-8 w-8 text-ink-300" />}
            title={ui("noProductsFound")}
            onReset={() => setActiveTabId("all")}
          />
        )}
      </div>
    </section>
  );
}
