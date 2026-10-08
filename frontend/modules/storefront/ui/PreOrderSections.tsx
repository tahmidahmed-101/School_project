"use client";

import { useMemo, useState } from "react";
import { Hero } from "./Hero";
import { PromoMarquee } from "./PromoMarquee";
import { VoucherSection, type Voucher } from "@/modules/marketing";
import { CategoryShowcase, TrendingSection } from "@/modules/catalog";
import { Newsletter } from "@/modules/marketing";
import { PreOrderCategoryTabs } from "./PreOrderCategoryTabs";
import { useCatalog, useProducts } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import { BRAND_INFO } from "@/lib/brand";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { EmptyState } from "@/design-system/patterns/EmptyState";
import { buttonClass } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { SectionHeading } from "@/design-system/ui/SectionHeading";

/** Same layout as the home page (Hero, browsable grid, newsletter), scoped to pre-order stock only. */
export function PreOrderSections({ vouchers }: { vouchers: Voucher[] }) {
  const { ui } = useLang();
  const { categories } = useCatalog();
  const { preorderProducts } = useProducts();
  const [activeCategory, setActiveCategory] = useState("all");

  // Only offer tabs for pre-order categories that actually have stock right now.
  const availableCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.type === "preorder" && preorderProducts.some((product) => product.category === category.id),
      ),
    [categories, preorderProducts],
  );

  const filteredProducts =
    activeCategory === "all"
      ? preorderProducts
      : preorderProducts.filter((product) => product.category === activeCategory);

  return (
    <div>
      <div className="bg-ink-50/70">
        <Container className="pb-1 pt-3">
          <Breadcrumbs items={[{ label: ui("navPreOrder") }]} />
        </Container>
      </div>
      <Hero heading={`${BRAND_INFO.name} ${ui("navPreOrder")}`} shopLink="/shop?type=preorder" preorder />
      <PromoMarquee />
      <VoucherSection vouchers={vouchers} />
      <CategoryShowcase preorder />

      {preorderProducts.length === 0 ? (
        <section className="border-b border-ink-200 bg-canvas py-8 sm:py-14">
          <Container>
            <SectionHeading title={ui("navPreOrder")} />
            <EmptyState
              icon={<CalendarClock className="mx-auto mb-3 h-10 w-10 text-ink-300" />}
              title={ui("preOrderEmpty")}
              action={
                <Link href="/shop" className={buttonClass()}>
                  {ui("cartStartShopping")}
                </Link>
              }
            />
          </Container>
        </section>
      ) : (
        <TrendingSection
          products={filteredProducts}
          title={ui("navPreOrder")}
          showViewAllLink={false}
          filters={
            availableCategories.length > 1 ? (
              <PreOrderCategoryTabs
                categories={availableCategories}
                value={activeCategory}
                onChange={setActiveCategory}
              />
            ) : undefined
          }
        />
      )}

      <Newsletter />
    </div>
  );
}
