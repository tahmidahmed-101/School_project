"use client";

import dynamic from "next/dynamic";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { ACCORDION_BODY, AccordionItem } from "@/design-system/ui/AccordionItem";
import { PanelLoading } from "./ListStatus";

// Each panel's code loads when its accordion is first opened, not with the product page. (next/dynamic needs its
// options written out as a literal on every call.)
const PriceReportForm = dynamic(() => import("./PriceReportForm").then((m) => m.PriceReportForm), {
  ssr: false,
  loading: PanelLoading,
});
const ProductQuestions = dynamic(() => import("./ProductQuestions").then((m) => m.ProductQuestions), {
  ssr: false,
  loading: PanelLoading,
});
const ProductReviews = dynamic(() => import("./ProductReviews").then((m) => m.ProductReviews), {
  ssr: false,
  loading: PanelLoading,
});
const ProductShare = dynamic(() => import("./ProductShare").then((m) => m.ProductShare), {
  ssr: false,
  loading: PanelLoading,
});
const ShippingReturns = dynamic(() => import("./ShippingReturns").then((m) => m.ShippingReturns), {
  ssr: false,
  loading: PanelLoading,
});

interface ProductAccordionsProps {
  product: Product;
  /** The SKU currently selected in the picker and the price shown for it, for the price report. */
  variantId?: string;
  currentPrice: number;
}

/**
 * Description, specifications, reviews, questions, shipping, price report and share accordions.
 * The API-backed ones fetch when opened: a closed accordion does not mount its content.
 */
export function ProductAccordions({ product, variantId, currentPrice }: ProductAccordionsProps) {
  const { t, ui, n } = useLang();
  // The API sends no description on list-sourced products and no specs for many, so empty sections are left out.
  const description = t(product.longDescription) || t(product.description);
  const hasHighlights = Boolean(product.highlights && product.highlights.length > 0);
  const hasSpecs = Boolean(product.specs && product.specs.length > 0);
  const reviewsTitle =
    product.reviewCount > 0 ? `${ui("reviewsTitle")} (${n(product.reviewCount)})` : ui("reviewsTitle");

  return (
    <>
      <div className="mt-8 divide-y divide-ink-100 border-b border-t border-ink-200 sm:mt-12">
        {(description || hasHighlights) && (
          <AccordionItem title={ui("description")} defaultOpen>
            <div className={`space-y-3 ${ACCORDION_BODY}`}>
              {description && <p>{description}</p>}
              {product.highlights && product.highlights.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="font-bold text-fg">{ui("highlights")}:</span>
                  <ul className="list-disc space-y-1 pl-4">
                    {product.highlights.map((h, i) => (
                      <li key={i}>{t(h)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AccordionItem>
        )}

        {hasSpecs && (
          <AccordionItem title={ui("specifications")}>
            <ul className="list-disc space-y-1.5 pb-3 pl-4 pt-3 text-xs leading-relaxed text-fg-muted">
              {product.specs?.map((spec, i) => (
                <li key={i}>
                  <strong className="text-ink-800">{t(spec.label)}:</strong> {t(spec.value)}
                </li>
              ))}
            </ul>
          </AccordionItem>
        )}

        <AccordionItem title={reviewsTitle}>
          <ProductReviews slug={product.slug} productId={product.id} />
        </AccordionItem>

        <AccordionItem title={ui("questionsTitle")}>
          <ProductQuestions slug={product.slug} productId={product.id} />
        </AccordionItem>

        <AccordionItem title={ui("shippingReturnsTitle")}>
          <ShippingReturns />
        </AccordionItem>

        <AccordionItem title={ui("priceReportTitle")}>
          <PriceReportForm
            slug={product.slug}
            productId={product.id}
            variantId={variantId}
            currentPrice={currentPrice}
          />
        </AccordionItem>

        <AccordionItem title={ui("shareTitle")}>
          <ProductShare slug={product.slug} name={t(product.name)} />
        </AccordionItem>
      </div>
    </>
  );
}
