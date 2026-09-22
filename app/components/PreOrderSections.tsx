"use client";

import { Hero } from "./Hero";
import { TrendingSection } from "./TrendingSection";
import { Newsletter } from "./Newsletter";
import { PREORDER_PRODUCTS } from "../lib/preorder-data";
import { useLang } from "../lib/i18n";

/** Same layout as the home page (Hero, browsable grid, newsletter), scoped to pre-order stock only. */
export function PreOrderSections() {
  const { ui } = useLang();

  return (
    <div>
      <Hero />

      {/* Browsable pre-order picks with category filter */}
      <TrendingSection
        products={PREORDER_PRODUCTS}
        title={ui("navPreOrder")}
        showViewAllLink={false}
      />

      <Newsletter />
    </div>
  );
}
