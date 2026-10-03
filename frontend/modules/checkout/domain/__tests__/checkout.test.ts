import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { CartItem, OrderForm } from "@/lib/types";
import { makeProduct } from "@/tests/fixtures";
import { EMPTY_ORDER_FORM, buildCheckoutRequest, mapApiFieldErrors, validateOrderForm } from "../checkout";

const validForm: OrderForm = {
  name: " Rahim Uddin ",
  phone: " 01712-345678 ",
  district: " Dhaka ",
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

  it("flags every field except the notes on an empty form", () => {
    expect(Object.keys(validateOrderForm(EMPTY_ORDER_FORM)).sort()).toEqual(["address", "district", "name", "phone"]);
  });

  it("requires a Bangladeshi mobile number, as the backend does", () => {
    for (const phone of ["01712345678", "+880 1712-345678", "8801712345678", "1712345678"]) {
      expect(validateOrderForm({ ...validForm, phone }).phone).toBeUndefined();
    }
    for (const phone of ["12345", "01212345678", "0171234567", "017123456789", "+1 415 555 0100"]) {
      expect(validateOrderForm({ ...validForm, phone }).phone).toBe("invalidPhone");
    }
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

  it("trims fields, sends the one name as first_name, and puts the district in shipping_address.city", () => {
    expect(request).toMatchObject({
      phone: "01712-345678",
      first_name: "Rahim Uddin",
      payment_method: "cod",
      coupon_code: "KULL10",
      notes: "ring the bell",
      shipping_address: {
        full_name: "Rahim Uddin",
        phone: "01712-345678",
        line1: "House 1, Road 2",
        city: "Dhaka",
        country: "Bangladesh",
      },
    });
  });

  it("omits optional fields that are empty", () => {
    const bare = buildCheckoutRequest({ ...validForm, notes: "  " }, items, { paymentMethod: "cod" });
    expect(bare).not.toHaveProperty("notes");
    expect(bare).not.toHaveProperty("coupon_code");
  });

  it("never sends the fields the form no longer asks for", () => {
    expect(request).not.toHaveProperty("email");
    expect(request).not.toHaveProperty("last_name");
    expect(request.shipping_address).not.toHaveProperty("postal_code");
  });
});

describe("mapApiFieldErrors", () => {
  const apiError = (fields: Record<string, string>) =>
    new ApiError({ status: 400, code: "validation_error", message: "Invalid", fields });

  it("maps API field names onto form fields", () => {
    expect(
      mapApiFieldErrors(apiError({ phone: "Bad phone", first_name: "Required", "shipping_address.line1": "Required" })),
    ).toEqual({ phone: "Bad phone", name: "Required", address: "Required" });
  });

  it("handles the backend's one-item-list wrapping of nested errors", () => {
    expect(mapApiFieldErrors(apiError({ "shipping_address.0.line1": "Too long" }))).toEqual({
      address: "Too long",
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
