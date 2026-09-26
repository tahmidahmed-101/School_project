"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useLang } from "../lib/i18n";
import { useCart } from "../lib/cart";
import { ApiError } from "../lib/api/client";
import { placeOrder } from "../lib/api/checkout";
import { errorKey } from "../lib/api/errors";
import { toOrderResult } from "../lib/api/adapters";
import {
  EMPTY_ORDER_FORM,
  NO_SHIPPING_CODES,
  buildCheckoutRequest,
  mapApiFieldErrors,
  validateOrderForm,
  type FormErrors,
} from "../lib/checkout";
import type { OrderForm, OrderResult } from "../lib/types";
import { OrderSuccess } from "./OrderSuccess";
import { Breadcrumbs } from "./Breadcrumbs";
import { CheckoutFields } from "./CheckoutFields";
import { CheckoutSummary } from "./CheckoutSummary";

export function CheckoutView() {
  const { ui } = useLang();
  const { items, subtotal, clearCart } = useCart();

  const [form, setForm] = useState<OrderForm>(EMPTY_ORDER_FORM);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  /** Turns the "required" / "invalid" markers from local validation into text in the shopper's language. */
  const localise = (errors: FormErrors): FormErrors =>
    Object.fromEntries(
      Object.entries(errors).map(([field, message]) => [
        field,
        message === "required" ? ui("fieldRequired") : message === "invalid" ? ui("fieldInvalid") : message,
      ]),
    );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const problems = validateOrderForm(form);
    if (Object.keys(problems).length > 0) {
      setFieldErrors(localise(problems));
      setErrorMsg(ui("checkoutValidationAlert"));
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    setFieldErrors({});
    try {
      // The backend prices the order (shipping zone, tax, discounts); its response is what the shopper sees.
      const order = await placeOrder(buildCheckoutRequest(form, items));
      setOrderResult(
        toOrderResult(order, {
          name: [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" "),
          address: form.address.trim(),
          district: form.district,
        }),
      );
      clearCart();
      window.scrollTo({ top: 0 });
    } catch (error) {
      if (error instanceof ApiError) {
        const mapped = mapApiFieldErrors(error);
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          setErrorMsg(ui(errorKey(error)));
        } else if (NO_SHIPPING_CODES.has(error.code)) {
          setErrorMsg(ui("errNoShipping"));
        } else if (error.status === 400 || error.status === 409) {
          // Business-rule failures (out of stock, pre-order closed, ...) come with a message written for the shopper.
          setErrorMsg(error.message || ui(errorKey(error)));
        } else {
          setErrorMsg(ui(errorKey(error)));
        }
      } else {
        setErrorMsg(ui("errGeneric"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const breadcrumbs = [
    { label: ui("navShop"), href: "/shop" },
    { label: ui("checkoutTitle") },
  ];

  if (orderResult) {
    return <OrderSuccess orderResult={orderResult} />;
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white py-20">
        <div className="max-w-sm space-y-4 px-4 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold-50 ring-1 ring-gold-200">
            <ShoppingCart className="h-9 w-9 text-gold-600" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="text-base font-bold text-ink-900">{ui("cartEmptyTitle")}</p>
          <p className="text-xs text-ink-600">{ui("cartEmptySubtitle")}</p>
          <Link
            href="/shop"
            className="inline-block rounded-full bg-gold-500 px-6 py-2.5 text-xs font-bold text-ink-950 shadow-md transition-colors hover:bg-gold-400"
          >
            {ui("cartStartShopping")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Breadcrumbs className="mb-4" items={breadcrumbs} />
        <div className="mb-8 flex items-center justify-between border-b border-ink-200 pb-4">
          <h1 className="ts-display text-2xl font-bold tracking-tight text-gold-600 sm:text-3xl">
            {ui("checkoutTitle")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            {errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {errorMsg}
              </div>
            )}
            <CheckoutFields
              form={form}
              errors={fieldErrors}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />
          </div>

          <div className="space-y-4 lg:col-span-5">
            <CheckoutSummary
              items={items}
              subtotal={subtotal}
              isSubmitting={isSubmitting}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
