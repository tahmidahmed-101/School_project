"use client";

import { useMemo, useState } from "react";
import { Hero } from "./Hero";
import { PromoMarquee } from "./PromoMarquee";
import { VoucherSection } from "./VoucherSection";
import { TrendingSection } from "./TrendingSection";
import { Newsletter } from "./Newsletter";
import { PreOrderCategoryTabs } from "./PreOrderCategoryTabs";
import { CATEGORIES } from "../lib/data";
import { PREORDER_PRODUCTS } from "../lib/preorder-data";
import { useLang } from "../lib/i18n";

/** Same layout as the home page (Hero, browsable grid, newsletter), scoped to pre-order stock only. */
export function PreOrderSections() {
  const { ui } = useLang();
  const [activeCategory, setActiveCategory] = useState("all");

  // Only offer tabs for categories that actually have pre-order stock right now.
  const availableCategories = useMemo(
    () => CATEGORIES.filter((category) => PREORDER_PRODUCTS.some((product) => product.category === category.id)),
    [],
  );

  const filteredProducts =
    activeCategory === "all"
      ? PREORDER_PRODUCTS
      : PREORDER_PRODUCTS.filter((product) => product.category === activeCategory);

  return (
    <div>
      <Hero shopLink="/shop?type=preorder" />
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
