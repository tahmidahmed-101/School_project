import { describe, expect, it } from "vitest";
import { formatBdt, fromPaisa, sumMoney, toPaisa } from "@/lib/money";

const TAKA = String.fromCharCode(0x9f3);

describe("formatBdt", () => {
  it("groups lakh and crore", () => {
    expect(formatBdt("12345678.5")).toBe(`${TAKA}1,23,45,678.50`);
    expect(formatBdt("999.00")).toBe(`${TAKA}999.00`);
  });

  it("keeps the sign before the currency mark", () => {
    expect(formatBdt("-1234.50")).toBe(`-${TAKA}1,234.50`);
  });
});

describe("paisa helpers", () => {
  it("round-trips a decimal string", () => {
    expect(fromPaisa(toPaisa("10.05"))).toBe("10.05");
  });

  it("sums without float drift", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
  });
});
