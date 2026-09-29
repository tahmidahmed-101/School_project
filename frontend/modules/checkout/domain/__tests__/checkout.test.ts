import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { CartItem, OrderForm } from "@/lib/types";
import { makeProduct } from "@/tests/fixtures";
import { EMPTY_ORDER_FORM, buildCheckoutRequest, mapApiFieldErrors, validateOrderForm } from "../checkout";

const validForm: OrderForm = {
  firstName: " Rahim ",
  lastName: " Uddin ",
  email: " rahim@example.com ",
  phone: " 01712-345678 ",
  district: " Dhaka ",
  postalCode: " 1207 ",
  address: " House 1, Road 2 ",
  notes: " ring the bell ",
};

const items: CartItem[] = [
  { product: makeProduct({ price: 999 }), quantity: 2, variantId: "variant-1" },
  { product: makeProduct({ id: "p-2" }), quantity: 1, variantId: "variant-2" },
];

describe("validateOrderForm", () => {
  it("accepts a complete form", () => {
    expect(validateOrderForm(validForm)).toEqual({});
  });

  it("flags every missing required field on an empty form", () => {
    expect(Object.keys(validateOrderForm(EMPTY_ORDER_FORM)).sort()).toEqual(
      ["address", "district", "email", "firstName", "phone", "postalCode"].sort(),
    );
  });

  it("rejects a malformed email and a too-short phone, but not an empty last name", () => {
    const errors = validateOrderForm({ ...validForm, lastName: "", email: "rahim@", phone: "12345" });
    expect(errors).toEqual({ email: "invalid", phone: "invalid" });
  });

  it("counts digits only when checking the phone", () => {
    expect(validateOrderForm({ ...validForm, phone: "+880 1712-345678" }).phone).toBeUndefined();
  });
});

describe("buildCheckoutRequest", () => {
  const request = buildCheckoutRequest(validForm, items, { paymentMethod: "cod", couponCode: "KULL10" });

  it("sends only variant ids and quantities, never prices", () => {
    expect(request.items).toEqual([
      { variant_id: "variant-1", quantity: 2 },
      { variant_id: "variant-2", quantity: 1 },
    ]);
    expect(JSON.stringify(request)).not.toContain("999");
    expect(JSON.stringify(request)).not.toContain("price");
  });

  it("trims fields and puts the district in shipping_address.city", () => {
    expect(request).toMatchObject({
      email: "rahim@example.com",
      phone: "01712-345678",
      first_name: "Rahim",
      last_name: "Uddin",
      payment_method: "cod",
      coupon_code: "KULL10",
      notes: "ring the bell",
      shipping_address: {
        full_name: "Rahim Uddin",
        line1: "House 1, Road 2",
        city: "Dhaka",
        postal_code: "1207",
        country: "Bangladesh",
      },
    });
  });

  it("omits optional fields that are empty", () => {
    const bare = buildCheckoutRequest({ ...validForm, lastName: "", notes: "  " }, items, { paymentMethod: "cod" });
    expect(bare).not.toHaveProperty("last_name");
    expect(bare).not.toHaveProperty("notes");
    expect(bare).not.toHaveProperty("coupon_code");
    expect(bare.shipping_address.full_name).toBe("Rahim");
  });
});

describe("mapApiFieldErrors", () => {
  const apiError = (fields: Record<string, string>) =>
    new ApiError({ status: 400, code: "validation_error", message: "Invalid", fields });

  it("maps API field names onto form fields", () => {
    expect(
      mapApiFieldErrors(apiError({ email: "Bad email", first_name: "Required", "shipping_address.line1": "Required" })),
    ).toEqual({ email: "Bad email", firstName: "Required", address: "Required" });
  });

  it("handles the backend's one-item-list wrapping of nested errors", () => {
    expect(mapApiFieldErrors(apiError({ "shipping_address.0.postal_code": "Invalid code" }))).toEqual({
      postalCode: "Invalid code",
    });
  });

  it("keeps the first message when several API fields land on one form field", () => {
    expect(
      mapApiFieldErrors(apiError({ "shipping_address.city": "First", "shipping_address.state": "Second" })),
    ).toEqual({ district: "First" });
  });

  it("ignores fields with no input of their own", () => {
    expect(mapApiFieldErrors(apiError({ "items.0.variant_id": "Unknown variant" }))).toEqual({});
  });
});
