"use client";

import { useMemo, useState } from "react";
import { Hero } from "./Hero";
import { PromoMarquee } from "./PromoMarquee";
import { VoucherSection } from "./VoucherSection";
import { TrendingSection } from "./TrendingSection";
import { Newsletter } from "./Newsletter";
import { PreOrderCategoryTabs } from "./PreOrderCategoryTabs";
import { useCatalog } from "../lib/catalog-context";
import { useLang } from "../lib/i18n";

/** Same layout as the home page (Hero, browsable grid, newsletter), scoped to pre-order stock only. */
export function PreOrderSections() {
  const { ui } = useLang();
  const { categories, preorderProducts } = useCatalog();
  const [activeCategory, setActiveCategory] = useState("all");

  // Only offer tabs for categories that actually have pre-order stock right now.
  const availableCategories = useMemo(
    () => categories.filter((category) => preorderProducts.some((product) => product.category === category.id)),
    [categories, preorderProducts],
  );

  const filteredProducts =
    activeCategory === "all"
      ? preorderProducts
      : preorderProducts.filter((product) => product.category === activeCategory);

  return (
    <div>
      <Hero shopLink="/shop?type=preorder" preorder />
      <PromoMarquee />
      <VoucherSection />

      {/* Browsable pre-order picks */}
      <TrendingSection
        products={filteredProducts}
        title={ui("navPreOrder")}
        showViewAllLink={false}
        filters={
          availableCategories.length > 1 ? (
            <PreOrderCategoryTabs categories={availableCategories} value={activeCategory} onChange={setActiveCategory} />
          ) : undefined
        }
      />

      <Newsletter />
    </div>
  );
}
