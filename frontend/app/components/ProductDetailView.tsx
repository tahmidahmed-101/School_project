"use client";

import { useMemo, useState } from "react";
import type { Product } from "../lib/types";
import { useLang } from "../lib/i18n";
import { useCatalog } from "../lib/catalog-context";
import { isPreOrderSoldOut } from "../lib/product";
import { applyVariant, defaultVariant, resolveVariant, selectionFor } from "../lib/variants";
import { ProductCardGrid } from "./ProductCardGrid";
import { Breadcrumbs } from "./Breadcrumbs";
import { ScrollReveal } from "./Reveal";
import { PreOrderInfo } from "./PreOrderInfo";
import { ProductGallery } from "./product/ProductGallery";
import { ProductSummary } from "./product/ProductSummary";
import { PreOrderPanel } from "./product/PreOrderPanel";
import { VariantPicker } from "./product/VariantPicker";
import { ProductActions } from "./product/ProductActions";
import { ProductAccordions } from "./product/ProductAccordions";

interface ProductDetailViewProps {
  product: Product;
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

export function ProductDetailView({ product }: ProductDetailViewProps) {
  const { t, ui } = useLang();
  const { products } = useCatalog();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState(() => defaultVariants(product));

  // The product as it looks with the chosen SKU: its price, stock and pre-order dates.
  const shown = useMemo(
    () => applyVariant(product, resolveVariant(product, selectedVariants)),
    [product, selectedVariants],
  );
  const isSoldOut = isPreOrderSoldOut(shown);
  const isOutOfStock = !shown.isPreOrder && !shown.inStock;
  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  return (
    <div className="w-full bg-white py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-ink-100 pb-4">
          <Breadcrumbs
            items={[
              { label: ui("navShop"), href: "/shop" },
              { label: t(product.name) },
            ]}
          />
        </div>

        {/* 50/50 split: gallery | details */}
        <div className="grid grid-cols-1 items-start gap-10 border-b border-ink-100 pb-8 sm:pb-16 lg:grid-cols-2 lg:gap-16 xl:gap-20">
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

            <ProductAccordions product={product} />
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div className="pt-6 sm:pt-12">
            <ScrollReveal>
              <h3 className="mb-4 text-xl font-bold text-ink-950 sm:mb-8">
                {ui("relatedProducts")}
              </h3>
            </ScrollReveal>
            <ProductCardGrid
              products={relatedProducts}
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 md:grid-cols-4 lg:gap-4"
            />
          </div>
        )}
      </div>
    </div>
  );
}
