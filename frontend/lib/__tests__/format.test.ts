import { describe, expect, it } from "vitest";
import { taka } from "../format";

describe("taka", () => {
  it("uses the South Asian digit grouping", () => {
    expect(taka(0)).toBe("৳0");
    expect(taka(999)).toBe("৳999");
    expect(taka(1450)).toBe("৳1,450");
    expect(taka(123456)).toBe("৳1,23,456");
    expect(taka(12345678)).toBe("৳1,23,45,678");
  });

  it("rounds to whole taka", () => {
    expect(taka(1449.6)).toBe("৳1,450");
  });
});
