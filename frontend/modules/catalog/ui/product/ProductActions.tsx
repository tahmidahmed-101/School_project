"use client";

import { ShoppingCart, Zap, Heart, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { useCart } from "@/modules/cart";
import { useWishlist } from "@/modules/wishlist";
import { usePreOrderModal } from "@/modules/preorder";
import { getMaxOrderQuantity, unavailableLabel } from "@/lib/product";
import { Button } from "@/design-system/ui/Button";
import { QuantityStepper } from "@/design-system/patterns/QuantityStepper";

const CTA = { size: "lg", fullWidth: true, className: "sm:flex-1" } as const;

interface ProductActionsProps {
  product: Product;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  /** The SKU the picker resolved to; undefined while an option is still to be picked. */
  variantId?: string;
  /** What to pick next, shown while the purchase buttons wait for it. */
  hint?: string;
  isSoldOut: boolean;
  /** The chosen SKU can't be bought right now (a regular product with no stock). */
  isOutOfStock?: boolean;
}

/** Quantity stepper, wishlist toggle, purchase buttons and the WhatsApp / call shortcuts. */
export function ProductActions({
  product,
  quantity,
  onQuantityChange,
  variantId,
  hint,
  isSoldOut,
  isOutOfStock = false,
}: ProductActionsProps) {
  const { ui, money } = useLang();
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(true);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setCtaVisible(Boolean(entry?.isIntersecting)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const router = useRouter();
  const { addItem } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();
  const { openPreOrderModal } = usePreOrderModal();

  const isWishlisted = isInWishlist(product.id);
  const maxQuantity = getMaxOrderQuantity(product);

  const canBuy = !isOutOfStock && !(product.isPreOrder && isSoldOut);
  const waiting = !variantId;
  const hintId = waiting && hint && canBuy ? "option-hint" : undefined;

  const buyNow = () => {
    if (addItem(product, quantity, variantId, { openDrawer: false })) router.push("/checkout");
  };

  const buyNowButton = (
    <Button
      {...CTA}
      variant={product.isPreOrder ? "secondary" : "primary"}
      onClick={buyNow}
      disabled={waiting}
      aria-describedby={hintId}
      leadingIcon={<Zap className={`h-4 w-4 fill-current ${product.isPreOrder ? "text-gold-400" : ""}`} />}
    >
      {ui("buyNow")}
    </Button>
  );

  return (
    <>
      <div className="mt-7 flex items-center gap-3.5">
        <QuantityStepper size="lg" quantity={quantity} onChange={onQuantityChange} min={1} max={maxQuantity} />

        <button
          type="button"
          onClick={() => toggleItem(product)}
          className={`flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all ${
            isWishlisted
              ? "shadow-xs border-red-500 bg-danger-surface text-danger"
              : "border-ink-200 bg-canvas text-ink-700 hover:border-ink-900 hover:text-ink-950"
          }`}
          aria-label={ui("navWishlist")}
          aria-pressed={isWishlisted}
        >
          <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current text-red-500" : ""}`} />
        </button>
      </div>

      <div ref={ctaRef} className="mt-4 flex flex-col gap-3.5 sm:flex-row">
        {isOutOfStock ? (
          <Button {...CTA} variant="outline" disabled>
            {ui(unavailableLabel(product))}
          </Button>
        ) : product.isPreOrder ? (
          isSoldOut ? (
            <Button {...CTA} variant="outline" disabled>
              {ui("preOrderUnavailable")}
            </Button>
          ) : (
            <Button
              {...CTA}
              onClick={() => openPreOrderModal(product, quantity, variantId)}
              disabled={waiting}
              aria-describedby={hintId}
              leadingIcon={<Sparkles className="h-4 w-4 fill-current" />}
            >
              {ui("preOrderNow")}
            </Button>
          )
        ) : (
          <>
            <Button
              {...CTA}
              variant="secondary"
              onClick={() => addItem(product, quantity, variantId)}
              disabled={waiting}
              aria-describedby={hintId}
              leadingIcon={<ShoppingCart className="h-4 w-4 text-gold-400" />}
            >
              {ui("addToCart")}
            </Button>
            {buyNowButton}
          </>
        )}
      </div>
      {hintId && (
        <p id={hintId} role="status" className="mt-2.5 text-xs font-semibold text-gold-800">
          {hint}
        </p>
      )}
      {canBuy && (
        <div
          inert={ctaVisible}
          className={`fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom,0px))] z-30 border-t border-ink-200 bg-white/95 px-4 py-2.5 shadow-bar backdrop-blur-sm transition-[transform,opacity] duration-200 lg:hidden ${
            ctaVisible ? "pointer-events-none translate-y-full opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="mr-auto shrink-0 text-base font-bold text-gold-800">{money(product.price)}</span>
            {product.isPreOrder ? (
              <Button
                size="md"
                onClick={() => openPreOrderModal(product, quantity, variantId)}
                disabled={waiting}
                aria-describedby={hintId}
                leadingIcon={<Sparkles className="h-4 w-4 fill-current" />}
              >
                {ui("preOrderNow")}
              </Button>
            ) : (
              <>
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => addItem(product, quantity, variantId)}
                  disabled={waiting}
                  aria-describedby={hintId}
                  aria-label={ui("addToCart")}
                  className="w-11 px-0"
                >
                  <ShoppingCart className="h-5 w-5 shrink-0 text-gold-400" />
                </Button>
                <Button
                  size="md"
                  onClick={buyNow}
                  disabled={waiting}
                  aria-describedby={hintId}
                  leadingIcon={<Zap className="h-4 w-4 fill-current" />}
                >
                  {ui("buyNow")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
