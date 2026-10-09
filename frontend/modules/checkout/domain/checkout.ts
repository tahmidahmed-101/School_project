import { ApiError } from "@/lib/api/client";
import type { ApiCheckoutRequest, ApiPaymentMethod } from "@/lib/api/types";
import type { UiKey } from "@/lib/dictionary";
import { productKind, type ProductKind } from "@/lib/product";
import type { CartItem, OrderForm } from "@/lib/types";

/** Coupons are for stock orders only: the backend refuses one on any basket holding a pre-order line. */
export const COUPON_STOCK_ONLY_CODE = "coupon_stock_only";

export function acceptsCoupon(items: CartItem[]): boolean {
  return items.length > 0 && items.every((item) => productKind(item.product) === "stock");
}

export type PaymentMethodsByKind = Record<ProductKind, ApiPaymentMethod[]>;

/** The basket's own half decides the list; a basket that is not purely pre-order is offered the stock methods. */
export function paymentMethodsFor(items: CartItem[], byKind: PaymentMethodsByKind): ApiPaymentMethod[] {
  const allPreorder = items.length > 0 && items.every((item) => productKind(item.product) === "preorder");
  return allPreorder ? byKind.preorder : byKind.stock;
}

export const EMPTY_ORDER_FORM: OrderForm = {
  name: "",
  phone: "",
  district: "",
  address: "",
  notes: "",
};

/** Form field each API field error belongs to, so a 400 can be shown next to the right input. */
const API_FIELD_TO_FORM: Record<string, keyof OrderForm> = {
  phone: "phone",
  first_name: "name",
  last_name: "name",
  notes: "notes",
  payment_method: "notes",
  "shipping_address.full_name": "name",
  "shipping_address.phone": "phone",
  "shipping_address.line1": "address",
  "shipping_address.city": "district",
  "shipping_address.state": "district",
};

export type FormErrors = Partial<Record<keyof OrderForm, string>>;

/** Builds the POST /checkout/ body. Prices are never sent: the backend prices every line from its variant id. */
export function buildCheckoutRequest(
  form: OrderForm,
  items: CartItem[],
  extras: { paymentMethod: string; couponCode?: string },
): ApiCheckoutRequest {
  const name = form.name.trim();
  const phone = form.phone.trim();
  return {
    phone,
    // The form asks for one name; the API's required `first_name` carries all of it.
    first_name: name,
    items: items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    shipping_address: {
      full_name: name,
      phone,
      line1: form.address.trim(),
      // The backend matches its shipping zones against line1 + city, so the district goes in `city`.
      city: form.district.trim(),
      country: "Bangladesh",
    },
    payment_method: extras.paymentMethod,
    ...(extras.couponCode && { coupon_code: extras.couponCode }),
    ...(form.notes.trim() && { notes: form.notes.trim() }),
  };
}

/**
 * True for a Bangladeshi mobile number, the same rule the backend applies (apps/common/utils/phone.py):
 * 01[3-9] followed by eight digits, written with or without the +880 country code, spaces or dashes.
 */
export function isBdMobile(raw: string): boolean {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("880")) digits = digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return /^01[3-9]\d{8}$/.test(digits);
}

/**
 * Cheap client-side checks for what the API requires, so an obviously incomplete form never hits the network.
 * Every field is required except the delivery notes.
 */
export function validateOrderForm(form: OrderForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "required";
  if (!form.phone.trim()) errors.phone = "required";
  else if (!isBdMobile(form.phone)) errors.phone = "invalidPhone";
  if (!form.district.trim()) errors.district = "required";
  if (!form.address.trim()) errors.address = "required";
  return errors;
}

/** Maps a backend validation error's fields onto the form; returns messages keyed by form field. */
export function mapApiFieldErrors(error: ApiError): FormErrors {
  const mapped: FormErrors = {};
  for (const [apiField, message] of Object.entries(error.fields)) {
    // items.0.variant_id etc. have no input of their own; they surface in the general message instead.
    // The backend wraps a nested serializer's errors in a one-item list, so "shipping_address.line1"
    // arrives as "shipping_address.0.line1".
    const target = API_FIELD_TO_FORM[apiField.replace(/^shipping_address\.\d+\./, "shipping_address.")];
    if (target && !mapped[target]) mapped[target] = message;
  }
  return mapped;
}

/** Domain codes where the store cannot deliver to the address at all (no zone / no rate configured). */
export const NO_SHIPPING_CODES = new Set(["no_shipping_zone", "no_shipping_rate"]);

/** Coupon refusals the storefront words itself, in both languages; any other code shows the API's own message. */
const COUPON_ERROR_KEYS: Record<string, UiKey> = {
  [COUPON_STOCK_ONLY_CODE]: "checkoutCouponStockOnly",
  coupon_not_started: "couponNotStarted",
  invalid_coupon: "couponInvalid",
  coupon_expired: "couponExpired",
  coupon_usage_limit_reached: "couponUsageLimitReached",
  coupon_minimum_not_met: "couponMinimumNotMet",
  coupon_not_applicable: "couponNotApplicable",
  coupon_customer_limit_reached: "couponCustomerLimitReached",
};

export const couponErrorKey = (code: string): UiKey | undefined =>
  Object.hasOwn(COUPON_ERROR_KEYS, code) ? COUPON_ERROR_KEYS[code] : undefined;
