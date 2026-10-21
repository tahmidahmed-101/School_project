import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import type { CartItem } from "@/lib/types";
import { basketSubtotal, freeDeliveryStatus } from "../free-delivery";
import { fromPaisa, sumMoney, toPaisa } from "../money";

const line = (price: number, quantity: number, isPreOrder = false): CartItem => ({
  product: makeProduct({ price, isPreOrder, kind: isPreOrder ? "preorder" : "stock" }),
  quantity,
  variantId: `v-${price}`,
});

describe("money", () => {
  it("adds decimal strings in paisa without float drift", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(sumMoney(["999.99", "0.01", null])).toBe("1000.00");
    expect(fromPaisa(toPaisa("1500"))).toBe("1500.00");
  });

  it("rounds half up once and throws on text that is not an amount", () => {
    expect(fromPaisa(toPaisa("0.005"))).toBe("0.01");
    expect(fromPaisa(toPaisa("0.004"))).toBe("0.00");
    expect(toPaisa(null)).toBe(BigInt(0));
    for (const bad of ["1,500", "৳500", "abc", "1e3"]) {
      expect(() => toPaisa(bad)).toThrow(`not an amount: "${bad}"`);
    }
  });
});

describe("basketSubtotal", () => {
  it("multiplies each line in paisa", () => {
    expect(basketSubtotal([line(499.5, 3), line(0.1, 3)])).toBe("1498.80");
  });
});

describe("freeDeliveryStatus", () => {
  it("says how much more a stock basket needs", () => {
    expect(freeDeliveryStatus("1500.00", [line(500, 2)])).toEqual({ reached: false, remaining: "500.00" });
  });

  it("rounds the gap up to a whole taka", () => {
    expect(freeDeliveryStatus("1500.00", [line(999.6, 1)])).toEqual({ reached: false, remaining: "501.00" });
  });

  it("is reached at the threshold and above it", () => {
    expect(freeDeliveryStatus("1500.00", [line(750, 2)])).toEqual({ reached: true });
    expect(freeDeliveryStatus("1500.00", [line(2000, 1)])).toEqual({ reached: true });
  });

  it("says nothing while the offer is off", () => {
    for (const off of [null, undefined, "", "0", "0.00"]) {
      expect(freeDeliveryStatus(off, [line(5000, 1)])).toBeNull();
    }
  });

  it("says nothing for an empty basket or one with a pre-order item", () => {
    expect(freeDeliveryStatus("1500.00", [])).toBeNull();
    expect(freeDeliveryStatus("1500.00", [line(5000, 1, true)])).toBeNull();
    expect(freeDeliveryStatus("1500.00", [line(5000, 1), line(100, 1, true)])).toBeNull();
  });
});
