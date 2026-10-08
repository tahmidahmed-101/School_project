"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { isPreOrderSoldOut, productKind, shopHome } from "@/lib/product";
import { applyVariant, defaultVariant, resolveVariant, selectionFor } from "@/lib/variants";
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

interface ProductDetailViewProps {
  product: Product;
  /** Other products from the same category, chosen by the server page. */
  relatedProducts: Product[];
}

/** Keeps only the option groups the picker shows. */
function pickGroups(product: Product, selection: Record<string, string>): Record<string, string> {
  const groups = new Set(product.variants?.map((v) => v.name.en));
  return Object.fromEntries(Object.entries(selection).filter(([group]) => groups.has(group)));
}

/** Starting selection: the default SKU's options, so the picker and the price agree on first paint. */
function defaultVariants(product: Product): Record<string, string> {
  const sku = defaultVariant(product);
  return sku ? pickGroups(product, selectionFor(sku)) : {};
}

export function ProductDetailView({ product, relatedProducts }: ProductDetailViewProps) {
  const { t, ui } = useLang();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState(() => defaultVariants(product));

  // The product as it looks with the chosen SKU: its price, stock and pre-order dates.
  const selectedSku = useMemo(() => resolveVariant(product, selectedVariants), [product, selectedVariants]);
  const shown = useMemo(() => applyVariant(product, selectedSku), [product, selectedSku]);
  const isSoldOut = isPreOrderSoldOut(shown);
  const isOutOfStock = !shown.isPreOrder && !shown.inStock;
  const kind = productKind(product);

  return (
    <div className="w-full bg-canvas pb-24 pt-8 sm:pt-12 lg:pb-12">
      <Container>
        <div className="mb-8 border-b border-ink-100 pb-4">
          <Breadcrumbs
            items={[
              { label: ui(kind === "preorder" ? "navPreOrder" : "navShop"), href: shopHome(kind) },
              { label: t(product.name) },
            ]}
          />
        </div>

        {/* Gallery | details, the gallery slightly the narrower of the two */}
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 xl:gap-20">
          <ProductGallery product={product} />

          <div className="flex w-full flex-col justify-start lg:pl-4 xl:pl-8">
            <ProductSummary product={shown} isSoldOut={isSoldOut} />

            {shown.isPreOrder && <PreOrderPanel product={shown} isSoldOut={isSoldOut} />}

            {product.variants && (
              <VariantPicker
                variants={product.variants}
                selected={selectedVariants}
                onSelect={(name, value) =>
                  setSelectedVariants((prev) => {
                    const next = { ...prev, [name]: value };
                    // If that colour/size pair was never made, snap the other option to a SKU that exists.
                    const sku = resolveVariant(product, next);
                    return sku ? { ...next, ...pickGroups(product, selectionFor(sku)) } : next;
                  })
                }
              />
            )}

            <ProductActions
              product={shown}
              quantity={quantity}
              onQuantityChange={setQuantity}
              selectedVariants={selectedVariants}
              isSoldOut={isSoldOut}
              isOutOfStock={isOutOfStock}
            />

            {shown.isPreOrder && <PreOrderInfo product={shown} className="mt-5" />}
          </div>
        </div>

        {/* Full width below the gallery and details */}
        <ProductAccordions product={product} variantId={selectedSku?.id} currentPrice={shown.price} />

        {relatedProducts.length > 0 && (
          <div className="pt-6 sm:pt-12">
            <ScrollReveal>
              <SectionHeading className="mb-4 sm:mb-8" title={ui("relatedProducts")} />
            </ScrollReveal>
            <ProductCardGrid
              products={relatedProducts}
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 md:grid-cols-4 lg:gap-4"
            />
          </div>
        )}
      </Container>
    </div>
  );
}
