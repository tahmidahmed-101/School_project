"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useLang } from "../lib/i18n";
import { useCart } from "../lib/cart";
import { getDeliveryFee } from "../lib/checkout";
import type { OrderForm, OrderResult } from "../lib/types";
import { OrderSuccess } from "./OrderSuccess";
import { Breadcrumbs } from "./Breadcrumbs";
import { CheckoutFields } from "./CheckoutFields";
import { CheckoutSummary } from "./CheckoutSummary";

const EMPTY_FORM: OrderForm = {
  fullName: "",
  phoneNumber: "",
  deliveryAddress: "",
  cityArea: "",
  deliveryZone: "inside-dhaka",
  paymentMethod: "cod",
  deliveryNotes: "",
};

export function CheckoutView() {
  const { ui } = useLang();
  const { items, subtotal, isFreeDelivery, clearCart } = useCart();

  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  const deliveryFee = getDeliveryFee(form.deliveryZone, isFreeDelivery);
  const grandTotal = subtotal + deliveryFee;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.phoneNumber.trim() || !form.deliveryAddress.trim()) {
      setErrorMsg(ui("checkoutValidationAlert"));
      return;
    }
    setIsSubmitting(true);
    setErrorMsg("");
    // Demo checkout: there is no backend, so the order is confirmed locally after a short delay.
    setTimeout(() => {
      setOrderResult({
        orderNumber: `TS-${Math.floor(10000 + Math.random() * 90000)}`,
        customer: form,
        items: [...items],
        subtotal,
        deliveryFee,
        discount: 0,
        total: grandTotal,
        createdAt: new Date().toISOString(),
      });
      clearCart();
      setIsSubmitting(false);
    }, 600);
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
        <Breadcrumbs className="mb-6 justify-center" items={breadcrumbs} />
        <div className="max-w-sm space-y-4 px-4 text-center">
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

        <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            {errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {errorMsg}
              </div>
            )}
            <CheckoutFields form={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} />
          </div>

          <div className="space-y-4 lg:col-span-5">
            <CheckoutSummary
              items={items}
              subtotal={subtotal}
              deliveryFee={deliveryFee}
              grandTotal={grandTotal}
              isSubmitting={isSubmitting}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
