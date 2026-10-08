"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { forgetGuestCart, syncedGuestCartToken, useCart } from "@/modules/cart";
import { ApiError } from "@/lib/api/client";
import { placeOrder } from "../data/mutations";
import { errorKey } from "@/lib/api/errors";
import { toOrderResult } from "../data/adapters";
import {
  EMPTY_ORDER_FORM,
  NO_SHIPPING_CODES,
  buildCheckoutRequest,
  mapApiFieldErrors,
  validateOrderForm,
  type FormErrors,
} from "../domain/checkout";
import { useCoupon, useShippingQuote } from "./useCheckoutPricing";
import type { ApiPaymentMethod } from "@/lib/api/types";
import type { OrderForm, OrderResult } from "@/lib/types";
import { OrderSuccess } from "./OrderSuccess";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { buttonClass } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";
import { FormAlert } from "@/design-system/ui/FormField";
import { CheckoutFields } from "./CheckoutFields";
import { CheckoutSummary } from "./CheckoutSummary";

export function CheckoutView({ paymentMethods }: { paymentMethods: ApiPaymentMethod[] }) {
  const { ui } = useLang();
  const { items, subtotal, clearCart } = useCart();
  const { withAuth } = useAuth();

  const [form, setForm] = useState<OrderForm>(EMPTY_ORDER_FORM);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [chosenPayment, setChosenPayment] = useState("cod");

  // Fall back to the first enabled method if the pick (default COD) is not offered by the store.
  const paymentMethod = paymentMethods.some((m) => m.key === chosenPayment) ? chosenPayment : paymentMethods[0].key;
  const shipping = useShippingQuote(items, form);
  const coupon = useCoupon(items);

  /** Turns the "required" / "invalid" / "invalidPhone" markers from local validation into text in the shopper's language. */
  const localise = (errors: FormErrors): FormErrors =>
    Object.fromEntries(
      Object.entries(errors).map(([field, message]) => [
        field,
        message === "required"
          ? ui("fieldRequired")
          : message === "invalid"
            ? ui("fieldInvalid")
            : message === "invalidPhone"
              ? ui("fieldInvalidPhone")
              : message,
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
      // Check out the shopper's saved cart when the backend holds exactly these items, so it stops being an open cart.
      const cartToken = await syncedGuestCartToken(items);
      const request = buildCheckoutRequest(form, items, { paymentMethod, couponCode: coupon.applied?.code });
      // Logged in: the order is placed on the customer's account. Guest: exactly as before.
      const order = await withAuth((authHeaders) => placeOrder(request, cartToken, authHeaders));
      if (cartToken) forgetGuestCart();
      setOrderResult(
        toOrderResult(order, {
          name: form.name.trim(),
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

  const breadcrumbs = [{ label: ui("checkoutTitle") }];

  if (orderResult) {
    return <OrderSuccess orderResult={orderResult} />;
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas py-20">
        <div className="max-w-sm space-y-4 px-4 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold-50 ring-1 ring-gold-200">
            <ShoppingCart className="h-9 w-9 text-gold-700" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="text-base font-bold text-fg">{ui("cartEmptyTitle")}</p>
          <p className="text-xs text-fg-muted">{ui("cartEmptySubtitle")}</p>
          <Link href="/shop" className={buttonClass()}>
            {ui("cartStartShopping")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas py-8 sm:py-12">
      <Container>
        <PageHeader breadcrumbs={<Breadcrumbs className="mb-4" items={breadcrumbs} />} title={ui("checkoutTitle")} />

        <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            {errorMsg && <FormAlert>{errorMsg}</FormAlert>}
            <CheckoutFields
              form={form}
              errors={fieldErrors}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              paymentMethods={paymentMethods}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setChosenPayment}
            />
          </div>

          <div className="space-y-4 lg:col-span-5">
            <CheckoutSummary
              items={items}
              subtotal={subtotal}
              isSubmitting={isSubmitting}
              shipping={shipping}
              coupon={coupon}
            />
          </div>
        </form>
      </Container>
    </div>
  );
}
