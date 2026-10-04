import { describe, expect, it } from "vitest";
import { toPriceReportInput } from "../data/product-extras";

describe("toPriceReportInput", () => {
  it("needs the expected price or a comment", () => {
    expect(toPriceReportInput("", "   ", "v1")).toEqual({ error: "required" });
  });

  it("rejects a price that is not above zero", () => {
    expect(toPriceReportInput("0", "", undefined)).toEqual({ error: "invalid_price" });
    expect(toPriceReportInput("-5", "cheaper elsewhere", undefined)).toEqual({ error: "invalid_price" });
    expect(toPriceReportInput("abc", "", undefined)).toEqual({ error: "invalid_price" });
  });

  it("sends the price as a two-decimal string with the selected variant", () => {
    expect(toPriceReportInput(" 450.5 ", " Seen at another shop ", "v1")).toEqual({
      input: { variant_id: "v1", expected_price: "450.50", comment: "Seen at another shop" },
    });
  });

  it("omits what was not given", () => {
    expect(toPriceReportInput("", "Price changed at checkout", undefined)).toEqual({
      input: { comment: "Price changed at checkout" },
    });
    expect(toPriceReportInput("300", "", undefined)).toEqual({ input: { expected_price: "300.00" } });
  });
});
