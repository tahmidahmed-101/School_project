"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles, Calendar, Trash2 } from "lucide-react";
import type { CartItem } from "@/lib/types";
import { useCart } from "@/modules/cart";
import { useCollectedVouchers, useVoucherText } from "@/modules/marketing";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { PreOrderBadge } from "@/design-system/patterns/PreOrderBadge";
import { Button } from "@/design-system/ui/Button";
import { FieldError, INPUT_CLASS } from "@/design-system/ui/FormField";
import { QuantityStepper } from "@/design-system/patterns/QuantityStepper";
import { errorKey } from "@/lib/api/errors";
import { ApiError } from "@/lib/api/client";
import { productKind, shopHome } from "@/lib/product";
import type { FreeDeliveryStatus } from "@/lib/free-delivery";
import { FreeDeliveryNote } from "@/design-system/patterns/FreeDeliveryNote";
import { acceptsCoupon, couponErrorKey } from "../domain/checkout";
import type { AppliedCoupon, ShippingQuoteState } from "./useCheckoutPricing";
import { cardClass } from "@/design-system/ui/Card";

interface CheckoutSummaryProps {
  items: CartItem[];
  /** Sum of the SKU prices in the cart: an estimate, the store confirms shipping, tax and discounts. */
  subtotal: number;
  isSubmitting: boolean;
  shipping: ShippingQuoteState;
  /** The store's free-delivery offer against this basket; null when there is nothing to say. */
  freeDelivery: FreeDeliveryStatus | null;
  coupon: {
    applied: AppliedCoupon | null;
    error: Error | null;
    checking: boolean;
    apply: (code: string) => void;
    remove: () => void;
  };
}

/** Order summary card: line items, totals and the submit button. */
export function CheckoutSummary({
  items,
  subtotal,
  isSubmitting,
  shipping,
  freeDelivery,
  coupon,
}: CheckoutSummaryProps) {
  const { t, ui, money, n } = useLang();
  const [couponInput, setCouponInput] = useState("");
  const shippingFee = shipping.status === "ok" ? shipping.fee : 0;
  const ownCouponMessage = coupon.error instanceof ApiError ? couponErrorKey(coupon.error.code) : undefined;
  const couponError = !coupon.error
    ? ""
    : ownCouponMessage
      ? ui(ownCouponMessage)
      : coupon.error instanceof ApiError &&
          coupon.error.status < 500 &&
          coupon.error.status !== 429 &&
          coupon.error.message
        ? coupon.error.message
        : ui(errorKey(coupon.error));
  const { updateQuantity, removeItem } = useCart();
  const vouchers = useCollectedVouchers();
  const voucherText = useVoucherText();

  const preOrderItem = items.find((i) => productKind(i.product) === "preorder");
  const hasPreOrder = Boolean(preOrderItem);
  const hasMixed = hasPreOrder && items.some((i) => productKind(i.product) === "stock");
  const showCoupon = acceptsCoupon(items);
  const discount = showCoupon ? (coupon.applied?.discountAmount ?? 0) : 0;
  const total = Math.max(0, subtotal - discount) + shippingFee;

  return (
    <div className={cardClass("canvas", "space-y-4 p-5 shadow-sm")}>
      <h3 className="border-b border-ink-200 pb-3 text-sm font-bold text-fg">
        {ui("checkoutOrderSummary")} ({n(items.length)})
      </h3>

      {hasPreOrder && (
        <div className="shadow-2xs space-y-1.5 rounded-xl border border-gold-300 bg-gold-50/90 p-3.5 text-xs text-gold-950">
          <div className="flex items-center gap-2 font-bold text-gold-900">
            <Sparkles className="h-4 w-4 shrink-0 text-gold-700" />
            <span>{ui("checkoutPreOrderNotice")}</span>
          </div>
          <p className="text-2xs leading-relaxed text-gold-900">{ui("checkoutPreOrderShipping")}</p>
          {hasMixed && (
            <p className="border-t border-gold-200/80 pt-1.5 text-2xs leading-relaxed text-ink-700">
              {ui("cartMixedNotice")}
            </p>
          )}
        </div>
      )}

      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
        {items.map(({ product, quantity, variantTitle, variantId }) => (
          <div key={variantId} className="flex items-start gap-3 text-xs">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-surface-muted">
              <Image src={photo(product.image)} alt={t(product.name)} fill sizes="48px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-start justify-between gap-1">
                <div className="truncate font-semibold text-fg">{t(product.name)}</div>
                {product.isPreOrder && (
                  <PreOrderBadge status={product.preorderStatus || "available"} size="sm" className="shrink-0" />
                )}
              </div>
              {variantTitle && <div className="truncate text-2xs font-medium text-fg-subtle">{variantTitle}</div>}
              <div className="text-2xs font-medium text-fg-subtle">{money(product.price)}</div>
              <div className="flex items-center gap-2 pt-0.5">
                <QuantityStepper quantity={quantity} onChange={(next) => updateQuantity(variantId, next)} />
                <button
                  type="button"
                  onClick={() => removeItem(variantId)}
                  className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-danger-surface hover:text-danger"
                  aria-label={ui("cartRemove")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {product.isPreOrder && product.expectedDelivery && (
                <div className="flex items-center gap-1 text-2xs font-medium text-gold-800">
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

      {showCoupon && (
        <div className="space-y-1.5 border-t border-ink-200 pt-3">
          <label htmlFor="co-coupon" className="block text-xs font-semibold text-fg">
            {ui("checkoutCouponLabel")}
          </label>
          {coupon.applied ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
              <span className="font-bold text-emerald-800">
                {ui("checkoutCouponApplied")}: {coupon.applied.code}
              </span>
              <button
                type="button"
                onClick={() => {
                  coupon.remove();
                  setCouponInput("");
                }}
                className="cursor-pointer font-semibold text-fg-subtle hover:text-danger"
              >
                {ui("checkoutCouponRemove")}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
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
                  aria-invalid={Boolean(couponError) || undefined}
                  aria-describedby={couponError ? "co-coupon-error" : undefined}
                  className={INPUT_CLASS}
                />
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                loading={coupon.checking}
                onClick={() => coupon.apply(couponInput)}
              >
                {!coupon.checking && ui("checkoutCouponApply")}
              </Button>
            </div>
          )}
          {couponError && <FieldError id="co-coupon-error">{couponError}</FieldError>}
          {!coupon.applied && vouchers.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-2xs font-semibold text-fg-subtle">{ui("checkoutYourVouchers")}</p>
              <div className="flex flex-wrap gap-1.5">
                {vouchers.map((voucher) => (
                  <button
                    key={voucher.code}
                    type="button"
                    disabled={coupon.checking}
                    title={voucherText.condition(voucher)}
                    onClick={() => {
                      setCouponInput(voucher.code);
                      coupon.apply(voucher.code);
                    }}
                    className="cursor-pointer rounded-full border border-gold-300 bg-gold-50 px-2.5 py-1 text-2xs font-bold text-gold-900 transition-colors hover:bg-gold-100 disabled:cursor-default disabled:opacity-60"
                  >
                    <span className="font-mono">{voucher.code}</span> · {voucherText.title(voucher)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!hasMixed && (
        <div className="space-y-2 border-t border-ink-200 pt-3 text-xs">
          <div className="flex justify-between text-fg-muted">
            <span>{ui("checkoutItemsTotal")}</span>
            <span className="font-bold text-fg">{money(subtotal)}</span>
          </div>
          {showCoupon && coupon.applied && (
            <div className="flex justify-between text-emerald-700">
              <span>
                {ui("checkoutDiscount")} ({coupon.applied.code})
              </span>
              <span className="font-bold">-{money(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-fg-muted">
            <span>{ui("checkoutShippingFee")}</span>
            <span className="text-right font-semibold text-fg-subtle">
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
          <FreeDeliveryNote status={freeDelivery} />
          {preOrderItem && (
            <div className="flex items-start justify-between rounded-xl border border-gold-200/80 bg-gold-50/70 p-2 text-2xs text-gold-900">
              <span className="flex items-center gap-1 font-medium">
                <Calendar className="h-3 w-3 text-gold-700" />
                {ui("expectedDelivery")}
              </span>
              <span className="text-right font-bold">
                {preOrderItem.product.expectedDelivery ? t(preOrderItem.product.expectedDelivery) : "Refer to items"}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-ink-200 pt-2 text-sm font-bold text-fg">
            <span>{ui("checkoutGrandTotal")}</span>
            <span className="text-base text-gold-800">{money(total)}</span>
          </div>
          <p className="text-2xs leading-relaxed text-fg-subtle">{ui("checkoutTotalPending")}</p>
        </div>
      )}

      <Button type="submit" size="lg" fullWidth loading={isSubmitting} disabled={hasMixed}>
        {isSubmitting ? ui("checkoutPlacing") : ui("checkoutPlaceOrderBtn")}
      </Button>
      <div className="flex items-center justify-center pt-2 text-center">
        <Link
          href={shopHome(hasPreOrder && !hasMixed ? "preorder" : "stock")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-subtle transition-colors hover:text-gold-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{ui("backToShopping")}</span>
        </Link>
      </div>
    </div>
  );
}
