"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles, Calendar, Trash2 } from "lucide-react";
import type { CartItem } from "@/lib/types";
import { useCart } from "@/modules/cart";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { PreOrderBadge } from "@/design-system/patterns/PreOrderBadge";
import { Button } from "@/design-system/ui/Button";
import { QuantityStepper } from "@/design-system/patterns/QuantityStepper";
import { errorKey } from "@/lib/api/errors";
import { ApiError } from "@/lib/api/client";
import type { AppliedCoupon, ShippingQuoteState } from "./useCheckoutPricing";

interface CheckoutSummaryProps {
  items: CartItem[];
  /** Sum of the SKU prices in the cart: an estimate, the store confirms shipping, tax and discounts. */
  subtotal: number;
  isSubmitting: boolean;
  shipping: ShippingQuoteState;
  coupon: {
    applied: AppliedCoupon | null;
    error: Error | null;
    checking: boolean;
    apply: (code: string) => void;
    remove: () => void;
  };
}

/** Order summary card: line items, totals and the submit button. */
export function CheckoutSummary({ items, subtotal, isSubmitting, shipping, coupon }: CheckoutSummaryProps) {
  const { t, ui, money, n } = useLang();
  const [couponInput, setCouponInput] = useState("");
  const discount = coupon.applied?.discountAmount ?? 0;
  const shippingFee = shipping.status === "ok" ? shipping.fee : 0;
  const total = Math.max(0, subtotal - discount) + shippingFee;
  const couponError = !coupon.error
    ? ""
    : coupon.error instanceof ApiError &&
        coupon.error.status < 500 &&
        coupon.error.status !== 429 &&
        coupon.error.message
      ? coupon.error.message
      : ui(errorKey(coupon.error));
  const { updateQuantity, removeItem } = useCart();

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
          <p className="text-[11px] leading-relaxed text-gold-900">{ui("checkoutPreOrderShipping")}</p>
          {hasMixed && (
            <p className="border-t border-gold-200/80 pt-1.5 text-[10px] leading-relaxed text-ink-700">
              {ui("cartMixedNotice")}
            </p>
          )}
        </div>
      )}

      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
        {items.map(({ product, quantity, selectedVariant }, idx) => (
          <div key={`${product.id}-${idx}`} className="flex items-start gap-3 text-xs">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
              <Image src={photo(product.image)} alt={t(product.name)} fill sizes="48px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-start justify-between gap-1">
                <div className="truncate font-semibold text-ink-900">{t(product.name)}</div>
                {product.isPreOrder && (
                  <PreOrderBadge status={product.preorderStatus || "available"} size="sm" className="shrink-0" />
                )}
              </div>
              <div className="text-[11px] font-medium text-ink-500">{money(product.price)}</div>
              <div className="flex items-center gap-2 pt-0.5">
                <QuantityStepper
                  quantity={quantity}
                  onChange={(next) => updateQuantity(product.id, next, selectedVariant)}
                />
                <button
                  type="button"
                  onClick={() => removeItem(product.id, selectedVariant)}
                  className="cursor-pointer p-1 text-ink-400 transition-colors hover:text-red-600"
                  aria-label={ui("cartRemove")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {product.isPreOrder && product.expectedDelivery && (
                <div className="flex items-center gap-1 text-[10px] font-medium text-gold-800">
                  <Calendar className="h-2.5 w-2.5 shrink-0" />
                  <span>
                    {ui("expectedDelivery")}: {t(product.expectedDelivery)}
                  </span>
                </div>
              )}
            </div>
            <div className="shrink-0 font-bold text-gold-800">{money(product.price * quantity)}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 border-t border-ink-200 pt-3">
        <label htmlFor="co-coupon" className="text-xs font-semibold text-ink-700">
          {ui("checkoutCouponLabel")}
        </label>
        {coupon.applied ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
            <span className="font-bold text-emerald-800">
              {ui("checkoutCouponApplied")}: {coupon.applied.code}
            </span>
            <button
              type="button"
              onClick={() => {
                coupon.remove();
                setCouponInput("");
              }}
              className="cursor-pointer font-semibold text-ink-500 hover:text-red-600"
            >
              {ui("checkoutCouponRemove")}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              id="co-coupon"
              type="text"
              maxLength={32}
              value={couponInput}
              placeholder={ui("checkoutCouponPlaceholder")}
              onChange={(e) => setCouponInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter here must not submit the whole order form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  coupon.apply(couponInput);
                }
              }}
              className="min-w-0 flex-1 rounded-xl border border-ink-200 px-3 py-2 text-xs uppercase outline-none focus:border-gold-500"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!couponInput.trim()}
              loading={coupon.checking}
              onClick={() => coupon.apply(couponInput)}
            >
              {!coupon.checking && ui("checkoutCouponApply")}
            </Button>
          </div>
        )}
        {couponError && <p className="text-[11px] font-medium text-red-600">{couponError}</p>}
      </div>

      <div className="space-y-2 border-t border-ink-200 pt-3 text-xs">
        <div className="flex justify-between text-ink-600">
          <span>{ui("checkoutItemsTotal")}</span>
          <span className="font-bold text-ink-900">{money(subtotal)}</span>
        </div>
        {coupon.applied && (
          <div className="flex justify-between text-emerald-700">
            <span>
              {ui("checkoutDiscount")} ({coupon.applied.code})
            </span>
            <span className="font-bold">-{money(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-ink-600">
          <span>{ui("checkoutShippingFee")}</span>
          <span className="text-right font-semibold text-ink-500">
            {shipping.status === "ok"
              ? shipping.fee === 0
                ? ui("cartDeliveryFree")
                : money(shipping.fee)
              : shipping.status === "loading"
                ? ui("checkoutShippingChecking")
                : shipping.status === "unavailable"
                  ? ui("checkoutShippingUnavailable")
                  : ui("checkoutShippingPending")}
          </span>
        </div>
        {preOrderItem && (
          <div className="flex items-start justify-between rounded-lg border border-gold-200/80 bg-gold-50/70 p-2 text-[11px] text-gold-900">
            <span className="flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3 text-gold-600" />
              {ui("expectedDelivery")}
            </span>
            <span className="text-right font-bold">
              {preOrderItem.product.expectedDelivery ? t(preOrderItem.product.expectedDelivery) : "Refer to items"}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-ink-200 pt-2 text-sm font-bold text-ink-900">
          <span>{ui("checkoutGrandTotal")}</span>
          <span className="text-base text-gold-800">{money(total)}</span>
        </div>
        <p className="text-[10.5px] leading-relaxed text-ink-500">{ui("checkoutTotalPending")}</p>
      </div>

      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
        {isSubmitting ? ui("checkoutPlacing") : ui("checkoutPlaceOrderBtn")}
      </Button>
      <div className="flex items-center justify-center pt-2 text-center">
        <Link
          href="/shop"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-gold-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{ui("backToShopping")}</span>
        </Link>
      </div>
    </div>
  );
}
