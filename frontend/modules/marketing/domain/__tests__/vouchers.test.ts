import { describe, expect, it } from "vitest";
import { collectedVouchers, toVoucher, unexpiredVouchers } from "../vouchers";

const api = {
  code: "SAVE10",
  discount_type: "percentage",
  value: "10.00",
  min_order_amount: "2500.00",
  expires_at: null as string | null,
};

describe("toVoucher", () => {
  it("turns the API's decimal strings into numbers", () => {
    expect(toVoucher(api)).toEqual({
      code: "SAVE10",
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

describe("unexpiredVouchers", () => {
  const now = new Date("2026-10-11T12:00:00Z").getTime();
  const voucher = (code: string, expires_at: string | null) => toVoucher({ ...api, code, expires_at });

  it("keeps vouchers with no end date or one still ahead, and drops the ones that have passed", () => {
    const list = [
      voucher("FOREVER", null),
      voucher("LATER", "2026-10-31T17:59:59Z"),
      voucher("PASSED", "2026-10-11T11:59:59Z"),
    ];
    expect(unexpiredVouchers(list, now).map((v) => v.code)).toEqual(["FOREVER", "LATER"]);
  });
});
