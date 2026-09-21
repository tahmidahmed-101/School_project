"use client";

import { useMemo } from "react";
import { Hero } from "./Hero";
import { CategoryShowcase } from "./CategoryShowcase";
import { TrendingSection } from "./TrendingSection";
import { ProductGrid } from "./ProductGrid";
import { PreOrderSection } from "./PreOrderSection";
import { Newsletter } from "./Newsletter";
import { PRODUCTS } from "../lib/data";
import { useLang } from "../lib/i18n";

export function HomeSections() {
  const { ui } = useLang();

  // Best-seller shelf: hand-picked (featured) products first, then the rest of the catalogue
  const bestSellerProducts = useMemo(() => {
    return [...PRODUCTS]
      .filter((p) => !p.isPreOrder)
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
      .slice(0, 8);
  }, []);

  return (
    <div>
      <Hero />
      <CategoryShowcase />

      {/* Trending Picks with Interactive Category Filter */}
      <TrendingSection />

      {/* Pre-order Section */}
      <PreOrderSection />

      {/* Best Seller Showcase */}
      <ProductGrid
        products={bestSellerProducts}
        title={ui("bestSellersTitle")}
        viewAllLink="/shop"
        viewAllText={ui("viewAllProducts")}
      />

      <Newsletter />
    </div>
  );
}
