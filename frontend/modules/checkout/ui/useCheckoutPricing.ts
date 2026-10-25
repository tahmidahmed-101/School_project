"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { toShippingQuoteState, type ShippingQuoteState } from "../data/adapters";
import { quoteShipping, validateCoupon } from "../data/mutations";
import type { CartItem, OrderForm } from "@/lib/types";

const toApiItems = (items: CartItem[]) =>
  items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity }));

const itemsKeyOf = (items: CartItem[]) => items.map((i) => `${i.variantId}:${i.quantity}`).join("|");

export type { ShippingQuoteState };

/**
 * Live delivery fee for the cart to the typed address. The backend matches its shipping zones on the address text,
 * so this waits until both address and district are filled. Results are tied to the inputs they were computed for,
 * so a stale answer is never shown after the cart or address changes.
 */
export function useShippingQuote(items: CartItem[], form: OrderForm): ShippingQuoteState {
  const addressText = `${form.address.trim()} ${form.district.trim()}`.trim();
  const ready = Boolean(form.address.trim() && form.district.trim() && items.length > 0);
  const key = `${itemsKeyOf(items)}#${addressText}`;
  const [result, setResult] = useState<{ key: string; state: ShippingQuoteState } | null>(null);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const quote = await quoteShipping(toApiItems(items), addressText, controller.signal);
        setResult({ key, state: toShippingQuoteState(quote) });
      } catch (error) {
        if (controller.signal.aborted) return;
        // A definite "no delivery here" answer is shown; transient failures (network, throttle) just leave the fee pending.
        const definite = error instanceof ApiError && (error.status === 400 || error.status === 404);
        setResult({ key, state: definite ? { status: "unavailable" } : { status: "idle" } });
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `items` is captured through `key` (its variant ids and quantities), which is all the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  if (!ready) return { status: "idle" };
  return result?.key === key ? result.state : { status: "loading" };
}

export interface AppliedCoupon {
  code: string;
  discountAmount: number;
}

/** Coupon checked against the cart before submitting. Editing the cart drops it, since the discount depends on the subtotal. */
export function useCoupon(
  items: CartItem[],
  shopper: { phone: string; withAuth: <T>(send: (headers: Record<string, string>) => Promise<T>) => Promise<T> },
) {
  const itemsKey = itemsKeyOf(items);
  const shopperRef = useRef(shopper);
  useEffect(() => {
    shopperRef.current = shopper;
  });
  const [applied, setApplied] = useState<(AppliedCoupon & { itemsKey: string }) | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [checking, setChecking] = useState(false);

  const apply = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setChecking(true);
      setError(null);
      try {
        const { phone, withAuth } = shopperRef.current;
        const preview = await withAuth((authHeaders) =>
          validateCoupon(trimmed, toApiItems(items), { phone: phone.trim(), authHeaders }),
        );
        setApplied({ code: preview.code, discountAmount: Number(preview.discount_amount), itemsKey });
      } catch (e) {
        setApplied(null);
        setError(e instanceof Error ? e : new Error("Coupon check failed"));
      } finally {
        setChecking(false);
      }
    },
    // `items` is captured through `itemsKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsKey],
  );

  const remove = useCallback(() => {
    setApplied(null);
    setError(null);
  }, []);

  return {
    applied:
      applied && applied.itemsKey === itemsKey ? { code: applied.code, discountAmount: applied.discountAmount } : null,
    error,
    checking,
    apply,
    remove,
  };
}
