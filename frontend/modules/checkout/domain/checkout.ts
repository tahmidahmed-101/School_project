import { ApiError } from "@/lib/api/client";
import type { ApiCheckoutRequest } from "@/lib/api/types";
import type { CartItem, OrderForm } from "@/lib/types";

export const EMPTY_ORDER_FORM: OrderForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  district: "",
  postalCode: "",
  address: "",
  notes: "",
};

/** Form field each API field error belongs to, so a 400 can be shown next to the right input. */
const API_FIELD_TO_FORM: Record<string, keyof OrderForm> = {
  email: "email",
  phone: "phone",
  first_name: "firstName",
  last_name: "lastName",
  notes: "notes",
  payment_method: "notes",
  "shipping_address.full_name": "firstName",
  "shipping_address.phone": "phone",
  "shipping_address.line1": "address",
  "shipping_address.city": "district",
  "shipping_address.state": "district",
  "shipping_address.postal_code": "postalCode",
};

export type FormErrors = Partial<Record<keyof OrderForm, string>>;

/** Builds the POST /checkout/ body. Prices are never sent: the backend prices every line from its variant id. */
export function buildCheckoutRequest(
  form: OrderForm,
  items: CartItem[],
  extras: { paymentMethod: string; couponCode?: string },
): ApiCheckoutRequest {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const phone = form.phone.trim();
  return {
    email: form.email.trim(),
    phone,
    first_name: firstName,
    ...(lastName && { last_name: lastName }),
    items: items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    shipping_address: {
      full_name: [firstName, lastName].filter(Boolean).join(" "),
      phone,
      line1: form.address.trim(),
      // The backend matches its shipping zones against line1 + city, so the district goes in `city`.
      city: form.district.trim(),
      postal_code: form.postalCode.trim(),
      country: "Bangladesh",
    },
    payment_method: extras.paymentMethod,
    ...(extras.couponCode && { coupon_code: extras.couponCode }),
    ...(form.notes.trim() && { notes: form.notes.trim() }),
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cheap client-side checks for the fields the API requires, so an obviously incomplete form never hits the network. */
export function validateOrderForm(form: OrderForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.firstName.trim()) errors.firstName = "required";
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "invalid";
  if (form.phone.replace(/\D/g, "").length < 7) errors.phone = "invalid";
  if (!form.district.trim()) errors.district = "required";
  if (!form.postalCode.trim()) errors.postalCode = "required";
  if (!form.address.trim()) errors.address = "required";
  return errors;
}

/** Maps a backend validation error's fields onto the form; returns messages keyed by form field. */
export function mapApiFieldErrors(error: ApiError): FormErrors {
  const mapped: FormErrors = {};
  for (const [apiField, message] of Object.entries(error.fields)) {
    // items.0.variant_id etc. have no input of their own; they surface in the general message instead.
    // The backend wraps a nested serializer's errors in a one-item list, so "shipping_address.postal_code"
    // arrives as "shipping_address.0.postal_code".
    const target = API_FIELD_TO_FORM[apiField.replace(/^shipping_address\.\d+\./, "shipping_address.")];
    if (target && !mapped[target]) mapped[target] = message;
  }
  return mapped;
}

/** Domain codes where the store cannot deliver to the address at all (no zone / no rate configured). */
export const NO_SHIPPING_CODES = new Set(["no_shipping_zone", "no_shipping_rate"]);
