"use client";

import { useMemo } from "react";
import { Hero } from "./Hero";
import { PromoMarquee } from "./PromoMarquee";
import { VoucherSection } from "@/modules/marketing";
import { CategoryShowcase } from "@/modules/catalog";
import { TrendingSection } from "@/modules/catalog";
import { ProductGrid } from "@/modules/catalog";
import { Newsletter } from "@/modules/marketing";
import { useCatalog, useProducts } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";

// Each shelf links to its full category; rendering every product made home cost grow with the catalogue.
const CATEGORY_SHELF_SIZE = 8;

export function HomeSections() {
  const { t, ui } = useLang();
  const { categories, catalogFailed } = useCatalog();
  const { stockProducts } = useProducts();

  // Best-seller shelf: hand-picked (featured) products first, then the rest of the catalogue
  const bestSellerProducts = useMemo(() => {
    return [...stockProducts].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).slice(0, 8);
  }, [stockProducts]);

  // One shelf per category, each showing every non-pre-order product in that category
  const categorySections = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        products: stockProducts.filter((p) => p.category === category.id).slice(0, CATEGORY_SHELF_SIZE),
      }))
      .filter((section) => section.products.length > 0);
  }, [categories, stockProducts]);

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

      {catalogFailed && (
        <p role="status" className="mx-auto max-w-2xl px-4 py-10 text-center text-sm font-semibold text-ink-600">
          {ui("catalogUnavailable")}
        </p>
      )}

      <Newsletter />
    </div>
  );
}
