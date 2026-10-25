"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/modules/auth";
import { forgetGuestCart, saveCartContact, syncedGuestCartToken, useCart } from "@/modules/cart";
import { useBrand } from "@/modules/catalog";
import { ApiError } from "@/lib/api/client";
import { freeDeliveryStatus } from "@/lib/free-delivery";
import { isBelowMinimum, productKind, shopHome } from "@/lib/product";
import { placeOrder } from "../data/mutations";
import { errorKey } from "@/lib/api/errors";
import { toOrderResult } from "../data/adapters";
import {
  ADVANCE_PAYMENT_REQUIRED_CODE,
  COUPON_STOCK_ONLY_CODE,
  EMPTY_ORDER_FORM,
  NO_SHIPPING_CODES,
  acceptsCoupon,
  buildCheckoutRequest,
  isBdMobile,
  mapApiFieldErrors,
  paymentMethodsFor,
  validateOrderForm,
  type FormErrors,
  type PaymentMethodsByKind,
} from "../domain/checkout";
import { useCoupon, useShippingQuote } from "./useCheckoutPricing";
import type { OrderForm, OrderResult } from "@/lib/types";
import { OrderSuccess } from "./OrderSuccess";
import { Breadcrumbs } from "@/design-system/patterns/Breadcrumbs";
import { buttonClass } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PageHeader } from "@/design-system/ui/PageHeader";
import { FormAlert } from "@/design-system/ui/FormField";
import { CheckoutFields } from "./CheckoutFields";
import { CheckoutSummary } from "./CheckoutSummary";
import { PreorderConfirmModal } from "./PreorderConfirmModal";

export function CheckoutView({ paymentMethodsByKind }: { paymentMethodsByKind: PaymentMethodsByKind }) {
  const { ui, t } = useLang();
  const { items, subtotal, clearCart } = useCart();
  const { withAuth } = useAuth();

  const [form, setForm] = useState<OrderForm>(EMPTY_ORDER_FORM);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [chosenPayment, setChosenPayment] = useState("cod");
  const [confirmingPreorder, setConfirmingPreorder] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  // Set once the backend refuses cash on delivery for this phone ("advance payment only").
  const [codRefusedFor, setCodRefusedFor] = useState<string | null>(null);
  const preorderItems = items.filter((item) => productKind(item.product) === "preorder");

  // COD stays hidden only while the refused number is still the one entered.
  const codRefused = codRefusedFor !== null && codRefusedFor === form.phone.trim();
  const paymentMethods = paymentMethodsFor(items, paymentMethodsByKind).filter((m) => !(codRefused && m.key === "cod"));
  // Fall back to the first enabled method if the pick (default COD) is not offered by the store.
  const paymentMethod = paymentMethods.some((m) => m.key === chosenPayment) ? chosenPayment : paymentMethods[0]?.key;
  const shipping = useShippingQuote(items, form);
  const coupon = useCoupon(items);
  const brand = useBrand();
  const freeDeliveryEstimate = freeDeliveryStatus(brand.freeDeliveryMinAmount, items);
  // The quote is the store's answer: once it charges a fee, the estimate must not claim free delivery beside it.
  const quoteCharges = shipping.status === "ok" && shipping.fee > 0;
  const freeDelivery = quoteCharges && freeDeliveryEstimate?.reached ? null : freeDeliveryEstimate;

  // An abandoned checkout is only worth a call back with a number, so the cart learns it as soon as it is valid.
  const contactPhone = form.phone.trim();
  const contactName = form.name.trim();
  const hasItems = items.length > 0;
  useEffect(() => {
    if (!hasItems || !isBdMobile(contactPhone)) return;
    const timer = setTimeout(() => void saveCartContact({ phone: contactPhone, name: contactName }), 800);
    return () => clearTimeout(timer);
  }, [contactPhone, contactName, hasItems]);

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

  /** A pre-order basket is placed only after the shopper confirms it in a modal; `confirmed` is that answer. */
  const handleSubmit = async (e?: FormEvent, { confirmed = false }: { confirmed?: boolean } = {}) => {
    e?.preventDefault();
    if (isSubmitting) return;
    // The summary disables the button too; this also stops a submit by Enter in a field.
    if (items.some(isBelowMinimum)) {
      setErrorMsg(ui("cartBelowMinimum"));
      return;
    }
    if (!paymentMethod) {
      setErrorMsg(ui("checkoutNoPaymentMethod"));
      return;
    }

    const problems = validateOrderForm(form);
    if (Object.keys(problems).length > 0) {
      setFieldErrors(localise(problems));
      setErrorMsg(ui("checkoutValidationAlert"));
      return;
    }

    if (preorderItems.length > 0 && !confirmed) {
      setErrorMsg("");
      setConfirmingPreorder(true);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    setFieldErrors({});
    try {
      // The backend prices the order (shipping zone, tax, discounts); its response is what the shopper sees.
      // Check out the shopper's saved cart when the backend holds exactly these items, so it stops being an open cart.
      const cartToken = await syncedGuestCartToken(items);
      const request = buildCheckoutRequest(form, items, {
        paymentMethod,
        couponCode: acceptsCoupon(items) ? coupon.applied?.code : undefined,
        smsOptIn,
      });
      // Logged in: the order is placed on the customer's account. Guest: exactly as before.
      const order = await withAuth((authHeaders) => placeOrder(request, cartToken, authHeaders));
      if (cartToken) forgetGuestCart();
      setOrderResult(
        toOrderResult(
          order,
          { name: form.name.trim(), address: form.address.trim(), district: form.district },
          paymentMethods.find((m) => m.key === paymentMethod)?.pay_to ?? "",
        ),
      );
      clearCart();
      window.scrollTo({ top: 0 });
    } catch (error) {
      if (error instanceof ApiError) {
        const mapped = mapApiFieldErrors(error);
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          setErrorMsg(ui(errorKey(error)));
        } else if (error.code === "mixed_basket") {
          setErrorMsg(ui("cartMixedNotice"));
        } else if (error.code === ADVANCE_PAYMENT_REQUIRED_CODE) {
          setCodRefusedFor(form.phone.trim());
          setErrorMsg(ui("checkoutAdvancePaymentRequired"));
        } else if (error.code === COUPON_STOCK_ONLY_CODE) {
          setErrorMsg(ui("checkoutCouponStockOnly"));
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
      // Closed either way: on success the order page replaces the form, on failure its alert says why.
      setConfirmingPreorder(false);
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
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={shopHome("stock")} className={buttonClass()}>
              {ui("navReadyStock")}
            </Link>
            <Link href={shopHome("preorder")} className={buttonClass()}>
              {ui("navPreOrder")}
            </Link>
          </div>
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
            {errorMsg ? (
              <FormAlert>{errorMsg}</FormAlert>
            ) : (
              !paymentMethod && <FormAlert>{ui("checkoutNoPaymentMethod")}</FormAlert>
            )}
            <CheckoutFields
              form={form}
              errors={fieldErrors}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              paymentMethods={paymentMethods}
              paymentMethod={paymentMethod ?? ""}
              onPaymentMethodChange={setChosenPayment}
              smsOptIn={smsOptIn}
              onSmsOptInChange={setSmsOptIn}
            />
          </div>

          <div className="space-y-4 lg:col-span-5">
            <CheckoutSummary
              items={items}
              subtotal={subtotal}
              isSubmitting={isSubmitting}
              shipping={shipping}
              freeDelivery={freeDelivery}
              coupon={coupon}
            />
          </div>
        </form>
        <PreorderConfirmModal
          open={confirmingPreorder}
          // The shopper's language, or the other one when staff wrote the terms in one language only.
          terms={t(brand.preorderTerms) || brand.preorderTerms.bn}
          submitting={isSubmitting}
          onClose={() => setConfirmingPreorder(false)}
          onConfirm={() => void handleSubmit(undefined, { confirmed: true })}
        />
      </Container>
    </div>
  );
}
