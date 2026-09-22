"use client";

import { useState } from "react";
import type { Product } from "../lib/types";
import { useLang } from "../lib/i18n";
import { PRODUCTS } from "../lib/data";
import { isPreOrderSoldOut } from "../lib/product";
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

function defaultVariants(product: Product): Record<string, string> {
  const initial: Record<string, string> = {};
  product.variants?.forEach((v) => {
    const first = v.options[0];
    if (first) initial[v.name.en] = first.value;
  });
  return initial;
}

export function ProductDetailView({ product }: ProductDetailViewProps) {
  const { t, ui } = useLang();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState(() => defaultVariants(product));

  const isSoldOut = isPreOrderSoldOut(product);
  const relatedProducts = PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id,
  ).slice(0, 4);

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
        <div className="grid grid-cols-1 items-start gap-10 border-b border-ink-100 pb-16 lg:grid-cols-2 lg:gap-16 xl:gap-20">
          <ProductGallery product={product} />

          <div className="flex w-full flex-col justify-start lg:pl-4 xl:pl-8">
            <ProductSummary product={product} isSoldOut={isSoldOut} />

            {product.isPreOrder && <PreOrderPanel product={product} isSoldOut={isSoldOut} />}

            {product.variants && (
              <VariantPicker
                variants={product.variants}
                selected={selectedVariants}
                onSelect={(name, value) =>
                  setSelectedVariants((prev) => ({ ...prev, [name]: value }))
                }
              />
            )}

            <ProductActions
              product={product}
              quantity={quantity}
              onQuantityChange={setQuantity}
              selectedVariants={selectedVariants}
              isSoldOut={isSoldOut}
            />

            {product.isPreOrder && <PreOrderInfo product={product} className="mt-5" />}

            <ProductAccordions product={product} />
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div className="pt-12">
            <ScrollReveal>
              <h3 className="mb-8 text-xl font-bold text-ink-950">{ui("relatedProducts")}</h3>
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
