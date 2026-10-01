"use client";

import type { Product } from "@/lib/types";
import { ProductCardGrid } from "./ProductCardGrid";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { Container } from "@/design-system/ui/Container";
import { SectionHeading } from "@/design-system/ui/SectionHeading";
import { useLang } from "@/lib/i18n";

interface ProductGridProps {
  products: Product[];
  title?: string;
  viewAllLink?: string;
  viewAllText?: string;
  columns?: 2 | 3 | 4;
}

export function ProductGrid({ products, title, viewAllLink, viewAllText, columns = 4 }: ProductGridProps) {
  const { ui } = useLang();

  const gridColsClass =
    columns === 3
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3"
      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <section className="border-b border-ink-200 bg-white py-8 sm:py-14">
      <Container>
        {(title || viewAllLink) && (
          <ScrollReveal className="mb-5 sm:mb-8">
            <SectionHeading
              title={title}
              viewAllHref={viewAllLink}
              viewAllLabel={viewAllText || ui("viewAllProducts")}
            />
          </ScrollReveal>
        )}

        <ProductCardGrid products={products} evenOnMobile className={`grid ${gridColsClass} gap-2.5 sm:gap-4`} />
      </Container>
    </section>
  );
}
