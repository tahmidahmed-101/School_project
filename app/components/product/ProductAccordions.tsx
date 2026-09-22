"use client";

import type { Product } from "../../lib/types";
import { useLang } from "../../lib/i18n";
import { AccordionItem } from "../ui/AccordionItem";

/** Description / specifications / shipping accordions plus the value-proposition row. */
export function ProductAccordions({ product }: { product: Product }) {
  const { t, ui } = useLang();

  return (
    <>
      <div className="mt-10 divide-y divide-ink-100 border-b border-t border-ink-200">
        <AccordionItem title={ui("description")} defaultOpen>
          <div className="space-y-3 pb-3 pt-3 text-xs leading-relaxed text-ink-600">
            <p>{t(product.longDescription) || t(product.description)}</p>
            {product.highlights && product.highlights.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="font-bold text-ink-900">{ui("highlights")}:</span>
                <ul className="list-disc space-y-1 pl-4">
                  {product.highlights.map((h, i) => (
                    <li key={i}>{t(h)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </AccordionItem>

        <AccordionItem title={ui("specifications")}>
          {product.specs && product.specs.length > 0 ? (
            <ul className="list-disc space-y-1.5 pb-3 pl-4 pt-3 text-xs leading-relaxed text-ink-600">
              {product.specs.map((spec, i) => (
                <li key={i}>
                  <strong className="text-ink-800">{t(spec.label)}:</strong> {t(spec.value)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="pb-3 pt-3 text-xs text-ink-500">{t(product.description)}</p>
          )}
        </AccordionItem>

        <AccordionItem title="Shipping & Returns">
          <div className="space-y-2 pb-3 pt-3 text-xs leading-relaxed text-ink-600">
            <p>
              Delivery all across Bangladesh: ৳60 inside Dhaka and ৳120 outside Dhaka. Free
              delivery on orders over ৳2,000. Wholesale and retail orders are both welcome.
            </p>
            <p>
              Questions about size, colour or a product&apos;s details? Message us on WhatsApp or
              Facebook before you order and we will help you choose.
            </p>
          </div>
        </AccordionItem>
      </div>
    </>
  );
}
