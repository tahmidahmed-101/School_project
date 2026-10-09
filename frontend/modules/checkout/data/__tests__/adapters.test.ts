import { describe, expect, it } from "vitest";
import type { ApiOrder } from "@/lib/api/types";
import { toOrderResult, toShippingQuoteState } from "../adapters";

describe("toShippingQuoteState", () => {
  const quote = { zone: "Dhaka", weight: "0.50", carrier_id: null, shipping_total: "80.00" };

  it("shows the quoted fee", () => {
    expect(toShippingQuoteState(quote)).toEqual({ status: "ok", fee: 80 });
    expect(toShippingQuoteState({ ...quote, free_delivery: false })).toEqual({ status: "ok", fee: 80 });
  });

  it("charges nothing when the quote says delivery is free", () => {
    expect(toShippingQuoteState({ ...quote, free_delivery: true })).toEqual({ status: "ok", fee: 0 });
  });

  it("is unavailable when the zone has no rate", () => {
    expect(toShippingQuoteState({ ...quote, shipping_total: null })).toEqual({ status: "unavailable" });
  });
});

const order: ApiOrder = {
  id: "o-1",
  order_number: "KM-1001",
  status: "pending",
  contact_email: "a@b.co",
  contact_phone: "01700000000",
  subtotal: "1998.00",
  tax_total: "0.00",
  shipping_total: "80.00",
  discount_total: "100.00",
  grand_total: "1978.00",
  coupon_code: "WELCOME100",
  lines: [
    {
      id: "l-1",
      product_name: "Wallet",
      variant_sku: "W-1",
      quantity: 2,
      unit_price: "999.00",
      total: "1998.00",
      is_preorder: false,
    },
  ],
  shipments: [],
} as unknown as ApiOrder;

describe("toOrderResult", () => {
  it("converts the wire decimals to numbers and merges the customer's typed details", () => {
    const result = toOrderResult(order, { name: "Rahim", address: "House 1", district: "Dhaka" }, "01700000000");
    expect(result).toMatchObject({
      orderNumber: "KM-1001",
      customerName: "Rahim",
      address: "House 1",
      district: "Dhaka",
      subtotal: 1998,
      shipping: 80,
      discount: 100,
      total: 1978,
      payTo: "01700000000",
      couponCode: "WELCOME100",
      lines: [{ name: "Wallet", sku: "W-1", quantity: 2, unitPrice: 999, total: 1998, isPreOrder: false }],
    });
  });
});
