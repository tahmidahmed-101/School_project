import { describe, expect, it } from "vitest";
import { collectedVouchers, toVoucher } from "../vouchers";

const api = {
  code: "KULL10",
  discount_type: "percentage",
  value: "10.00",
  min_order_amount: "2500.00",
  expires_at: null as string | null,
};

describe("toVoucher", () => {
  it("turns the API's decimal strings into numbers", () => {
    expect(toVoucher(api)).toEqual({
      code: "KULL10",
      kind: "percentage",
      value: 10,
      minSpend: 2500,
      expiresAt: null,
    });
  });

  it("keeps the expiry the API reports", () => {
    expect(toVoucher({ ...api, expires_at: "2026-12-31T17:59:59Z" }).expiresAt).toBe("2026-12-31T17:59:59Z");
  });

  it("keeps a fixed-amount coupon as taka off", () => {
    expect(toVoucher({ ...api, code: "WELCOME100", discount_type: "fixed", value: "100.00" })).toMatchObject({
      kind: "fixed",
      value: 100,
    });
  });
});

describe("toVoucher with a discount cap", () => {
  it("carries the cap when the coupon has one", () => {
    expect(toVoucher({ ...api, max_discount_amount: "200.00" }).maxDiscount).toBe(200);
  });

  it("has no cap when the API sends none", () => {
    expect(toVoucher({ ...api, max_discount_amount: null })).not.toHaveProperty("maxDiscount");
    expect(toVoucher({ ...api, max_discount_amount: "0.00" })).not.toHaveProperty("maxDiscount");
  });
});

describe("collectedVouchers", () => {
  it("keeps only collected codes the store still offers", () => {
    const live = [toVoucher(api), toVoucher({ ...api, code: "EID25" })];
    expect(collectedVouchers(live, ["EID25", "WITHDRAWN"]).map((v) => v.code)).toEqual(["EID25"]);
  });
});
