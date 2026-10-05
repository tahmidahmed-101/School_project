"use client";

import { useMemo } from "react";
import { Hero } from "./Hero";
import { PromoMarquee } from "./PromoMarquee";
import { VoucherSection, type Voucher } from "@/modules/marketing";
import { CategoryShowcase } from "@/modules/catalog";
import { TrendingSection } from "@/modules/catalog";
import { ProductGrid } from "@/modules/catalog";
import { Newsletter } from "@/modules/marketing";
import { useCatalog, useProducts } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import { BRAND_INFO } from "@/lib/brand";

import { bestSellers, categoryShelf, trending } from "../domain/home-products";

export function HomeSections({ vouchers }: { vouchers: Voucher[] }) {
  const { t, ui } = useLang();
  const { categories, catalogFailed } = useCatalog();
  const { stockProducts } = useProducts();

  const trendingProducts = useMemo(() => trending(stockProducts), [stockProducts]);
  const bestSellerProducts = useMemo(() => bestSellers(stockProducts), [stockProducts]);

  // One shelf per category, each linking to the full category
  const categorySections = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        products: categoryShelf(stockProducts, category.id),
      }))
      .filter((section) => section.products.length > 0);
  }, [categories, stockProducts]);

  return (
    <div>
      <Hero heading={`${BRAND_INFO.name} — ${t(BRAND_INFO.tagline)}`} />
      <PromoMarquee />
      <VoucherSection vouchers={vouchers} />
      <CategoryShowcase />

      {/* Trending Picks */}
      <TrendingSection products={trendingProducts} />

      {bestSellerProducts.length > 0 && (
        <ProductGrid
          products={bestSellerProducts}
          title={ui("bestSellersTitle")}
          viewAllLink="/shop"
          viewAllText={ui("viewAllProducts")}
        />
      )}

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
        <p role="status" className="mx-auto max-w-2xl px-4 py-10 text-center text-sm font-semibold text-fg-muted">
          {ui("catalogUnavailable")}
        </p>
      )}

      <Newsletter />
    </div>
  );
}
