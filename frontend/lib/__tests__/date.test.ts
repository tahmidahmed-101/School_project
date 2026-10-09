import { describe, expect, it } from "vitest";
import { shortDate } from "../date";

describe("shortDate", () => {
  it("writes the month and digits in the shopper's language", () => {
    expect(shortDate("2026-03-12", "en")).toBe("12 Mar 2026");
    expect(shortDate("2026-03-12", "bn")).toBe("১২ মার্চ, ২০২৬");
  });

  it("uses the Bangladesh calendar day for a timestamp", () => {
    expect(shortDate("2026-03-12T20:30:00Z", "en")).toBe("13 Mar 2026");
  });

  it("is empty for a missing or unreadable date", () => {
    expect(shortDate(null, "en")).toBe("");
    expect(shortDate("not a date", "bn")).toBe("");
  });
});
