"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { isPreOrderSoldOut, productKind, shopHome, shopListing } from "@/lib/product";
import { applyVariant, galleryFor, initialSelection, missingOption, resolveVariant, selectValue } from "@/lib/variants";
import { useReportPageProductKind } from "../context";
import { ProductCardGrid } from "./ProductCardGrid";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { Container } from "@/design-system/ui/Container";
import { SectionHeading } from "@/design-system/ui/SectionHeading";
import { PreOrderInfo } from "@/modules/preorder";
import { ProductGallery } from "./product/ProductGallery";
import { ProductSummary } from "./product/ProductSummary";
import { PreOrderPanel } from "./product/PreOrderPanel";
import { VariantPicker } from "./product/VariantPicker";
import { ProductActions } from "./product/ProductActions";
import { ProductAccordions } from "./product/ProductAccordions";
import { MoreProducts } from "./product/MoreProducts";

interface ProductDetailViewProps {
  product: Product;
  /** Other products from the same category, chosen by the server page. */
  relatedProducts: Product[];
  /** Further products from the same shop, listed in the rail beside the details. */
  moreProducts?: Product[];
}

export function ProductDetailView({ product, relatedProducts, moreProducts = [] }: ProductDetailViewProps) {
  const { t, ui } = useLang();
  const [quantity, setQuantity] = useState(1);
  const [selection, setSelection] = useState(() => initialSelection(product));

  // The product as it looks with the chosen SKU: its price, stock and pre-order dates. Until every option is
  // picked there is no SKU, and the product shows as the catalogue lists it.
  const selectedSku = useMemo(() => resolveVariant(product, selection), [product, selection]);
  const shown = useMemo(() => applyVariant(product, selectedSku), [product, selectedSku]);
  const images = useMemo(() => galleryFor(product, selection), [product, selection]);
  const toPick = missingOption(product, selection);
  const isSoldOut = isPreOrderSoldOut(shown);
  const isOutOfStock = !shown.isPreOrder && !shown.inStock;
  const kind = productKind(product);
  const summary = t(product.description) || t(product.tagline);
  useReportPageProductKind(kind);

  return (
    <div className="w-full bg-canvas pb-5 pt-8 sm:pt-12 lg:pb-14">
      <Container>
        <div className="mb-8 border-b border-ink-100 pb-4">
          <Breadcrumbs
            items={[
              { label: ui(kind === "preorder" ? "navPreOrder" : "navShop"), href: shopHome(kind) },
              { label: t(product.name) },
            ]}
          />
        </div>

        {/* Main column | "more products" rail, which follows the page down on wide screens */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {/* Gallery and details share one card, in equal halves */}
            <article className="grid grid-cols-1 items-start gap-8 rounded-xl border border-ink-200 bg-canvas p-4 sm:p-6 md:grid-cols-2">
              {/* Keyed on the lead photo so picking a value with photos of its own shows them straight away. */}
              <ProductGallery key={images[0]} product={product} images={images} />

              <div className="flex w-full min-w-0 flex-col justify-start">
                <ProductSummary product={shown} isSoldOut={isSoldOut} />

                {summary && (
                  <p className="mt-4 line-clamp-3 border-t border-ink-100 pt-4 text-sm leading-relaxed text-fg-muted">
                    {summary}
                  </p>
                )}

                {shown.isPreOrder && <PreOrderPanel product={shown} isSoldOut={isSoldOut} />}

                <VariantPicker
                  product={product}
                  selection={selection}
                  onSelect={(optionId, valueId) =>
                    setSelection((prev) => selectValue(product, prev, optionId, valueId))
                  }
                />

                <ProductActions
                  product={shown}
                  quantity={quantity}
                  onQuantityChange={setQuantity}
                  variantId={selectedSku?.id}
                  hint={toPick && ui("optionChoose").replace("{option}", toPick.name)}
                  isSoldOut={isSoldOut}
                  isOutOfStock={isOutOfStock}
                />

                {shown.isPreOrder && <PreOrderInfo product={shown} className="mt-5" />}
              </div>
            </article>

            {/* Below the card, the same width as it */}
            <ProductAccordions product={product} variantId={selectedSku?.id} currentPrice={shown.price} />

            {relatedProducts.length > 0 && (
              <div className="pt-10 sm:pt-16">
                <ScrollReveal>
                  <SectionHeading
                    className="mb-4 sm:mb-8"
                    title={ui("relatedProducts")}
                    viewAllHref={shopListing(kind, { category: product.category })}
                    viewAllLabel={ui("viewAllProducts")}
                  />
                </ScrollReveal>
                <ProductCardGrid
                  products={relatedProducts}
                  className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 md:grid-cols-4 lg:gap-4"
                />
              </div>
            )}
          </div>

          {moreProducts.length > 0 && (
            <aside className="hidden w-72 shrink-0 lg:sticky lg:top-[140px] lg:block">
              <MoreProducts products={moreProducts} />
            </aside>
          )}
        </div>
      </Container>
    </div>
  );
}
