"use client";

import { useMemo } from "react";
import { Hero } from "./Hero";
import { PromoMarquee } from "./PromoMarquee";
import { VoucherSection } from "./VoucherSection";
import { CategoryShowcase } from "./CategoryShowcase";
import { TrendingSection } from "./TrendingSection";
import { ProductGrid } from "./ProductGrid";
import { Newsletter } from "./Newsletter";
import { CATEGORIES, PRODUCTS } from "../lib/data";
import { useLang } from "../lib/i18n";

export function HomeSections() {
  const { t, ui } = useLang();

  // Best-seller shelf: hand-picked (featured) products first, then the rest of the catalogue
  const bestSellerProducts = useMemo(() => {
    return [...PRODUCTS]
      .filter((p) => !p.isPreOrder)
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
      .slice(0, 8);
  }, []);

  // One shelf per category, each showing every non-pre-order product in that category
  const categorySections = useMemo(() => {
    return CATEGORIES.map((category) => ({
      category,
      products: PRODUCTS.filter((p) => !p.isPreOrder && p.category === category.id),
    })).filter((section) => section.products.length > 0);
  }, []);

  return (
    <div>
      <Hero />
      <PromoMarquee />
      <VoucherSection />
      <CategoryShowcase />

      {/* Trending Picks */}
      <TrendingSection />

      {/* Best Seller Showcase */}
      <ProductGrid
        products={bestSellerProducts}
        title={ui("bestSellersTitle")}
        viewAllLink="/shop"
        viewAllText={ui("viewAllProducts")}
      />

      {/* One shelf per category (Women's Fashion, Bags & Wallets, ...) */}
      {categorySections.map(({ category, products }) => (
        <ProductGrid
          key={category.id}
          products={products}
          title={t(category.name)}
          viewAllLink={`/shop?category=${category.slug}`}
          viewAllText={ui("viewAllProducts")}
        />
      ))}

      <Newsletter />
    </div>
  );
}
