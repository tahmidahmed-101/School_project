"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles, Calendar } from "lucide-react";
import type { CartItem } from "../lib/types";
import { useLang } from "../lib/i18n";
import { photo } from "../lib/photo";
import { PreOrderBadge } from "./PreOrderBadge";
import { Loader } from "./Loader";

interface CheckoutSummaryProps {
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  isSubmitting: boolean;
}

/** Order summary card: line items, totals and the submit button. */
export function CheckoutSummary({
  items,
  subtotal,
  deliveryFee,
  grandTotal,
  isSubmitting,
}: CheckoutSummaryProps) {
  const { t, ui, money, n } = useLang();

  const preOrderItem = items.find((i) => i.product.isPreOrder);
  const hasPreOrder = Boolean(preOrderItem);
  const hasMixed = hasPreOrder && items.some((i) => !i.product.isPreOrder);

  return (
    <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <h3 className="border-b border-ink-200 pb-3 text-sm font-bold text-ink-900">
        {ui("checkoutOrderSummary")} ({n(items.length)})
      </h3>

      {hasPreOrder && (
        <div className="shadow-2xs space-y-1.5 rounded-xl border border-gold-300 bg-gold-50/90 p-3.5 text-xs text-gold-950">
          <div className="flex items-center gap-2 font-bold text-gold-900">
            <Sparkles className="h-4 w-4 shrink-0 text-gold-600" />
            <span>{ui("checkoutPreOrderNotice")}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-gold-900">
            {ui("checkoutPreOrderShipping")}
          </p>
          {hasMixed && (
            <p className="border-t border-gold-200/80 pt-1.5 text-[10px] leading-relaxed text-ink-700">
              {ui("cartMixedNotice")}
            </p>
          )}
        </div>
      )}

      <div className="max-h-60 space-y-2.5 overflow-y-auto pr-1">
        {items.map(({ product, quantity }, idx) => (
          <div key={`${product.id}-${idx}`} className="flex items-start gap-3 text-xs">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
              <Image
                src={photo(product.image)}
                alt={t(product.name)}
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-start justify-between gap-1">
                <div className="truncate font-semibold text-ink-900">{t(product.name)}</div>
                {product.isPreOrder && (
                  <PreOrderBadge
                    status={product.preorderStatus || "available"}
                    size="sm"
                    className="shrink-0"
                  />
                )}
              </div>
              <div className="text-[11px] font-medium text-ink-500">
                {n(quantity)} × {money(product.price)}
              </div>
              {product.isPreOrder && product.expectedDelivery && (
                <div className="flex items-center gap-1 text-[10px] font-medium text-gold-700">
                  <Calendar className="h-2.5 w-2.5 shrink-0" />
                  <span>
                    {ui("expectedDelivery")}: {t(product.expectedDelivery)}
                  </span>
                </div>
              )}
            </div>
            <div className="shrink-0 font-bold text-gold-600">{money(product.price * quantity)}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-ink-200 pt-3 text-xs">
        <div className="flex justify-between text-ink-600">
          <span>{ui("checkoutItemsTotal")}</span>
          <span className="font-bold text-ink-900">{money(subtotal)}</span>
        </div>
        <div className="flex justify-between text-ink-600">
          <span>{ui("checkoutShippingFee")}</span>
          <span className="font-bold text-ink-900">
            {deliveryFee === 0 ? ui("cartDeliveryFree") : money(deliveryFee)}
          </span>
        </div>
        {preOrderItem && (
          <div className="flex items-start justify-between rounded-lg border border-gold-200/80 bg-gold-50/70 p-2 text-[11px] text-gold-900">
            <span className="flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3 text-gold-600" />
              {ui("expectedDelivery")}
            </span>
            <span className="text-right font-bold">
              {preOrderItem.product.expectedDelivery
                ? t(preOrderItem.product.expectedDelivery)
                : "Refer to items"}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-ink-200 pt-2 text-sm font-bold text-ink-900">
          <span>{ui("checkoutGrandTotal")}</span>
          <span className="text-base text-gold-600">{money(grandTotal)}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gold-500 py-3.5 text-xs font-bold text-ink-950 shadow-lg shadow-gold-500/25 transition-all hover:bg-gold-400 active:scale-[0.99] disabled:opacity-50"
      >
        {isSubmitting && <Loader variant="inline" />}
        <span>{isSubmitting ? ui("checkoutPlacing") : ui("checkoutPlaceOrderBtn")}</span>
      </button>
      <div className="flex items-center justify-center pt-2 text-center">
        <Link
          href="/shop"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-gold-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{ui("backToShopping")}</span>
        </Link>
      </div>
    </div>
  );
}
