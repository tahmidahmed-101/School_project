import { describe, expect, it } from "vitest";
import { humanizeStatus, orderStatusKey, orderStatusTone, preorderStageTone, variantLabel } from "../orders";

describe("orderStatusKey", () => {
  it("maps the statuses a customer sees to their copy", () => {
    expect(orderStatusKey("delivered")).toBe("orderStatusDelivered");
    expect(orderStatusKey("awaiting_payment")).toBe("orderStatusAwaitingPayment");
  });

  it("has no key for a status it does not know", () => {
    expect(orderStatusKey("partially_refunded")).toBeNull();
    // Not an own property of the map: must not resolve to something inherited.
    expect(orderStatusKey("toString")).toBeNull();
  });
});

describe("humanizeStatus", () => {
  it("makes an unknown status readable", () => {
    expect(humanizeStatus("partially_refunded")).toBe("Partially refunded");
  });
});

describe("orderStatusTone", () => {
  it("separates finished, cancelled and in-progress orders", () => {
    expect(orderStatusTone("delivered")).toBe("done");
    expect(orderStatusTone("closed")).toBe("done");
    expect(orderStatusTone("cancelled")).toBe("bad");
    expect(orderStatusTone("shipped")).toBe("progress");
  });
});

describe("variantLabel", () => {
  it("joins what the variant has", () => {
    expect(variantLabel({ color: "Black", size: "M" })).toBe("Black / M");
    expect(variantLabel({ color: "", size: "M" })).toBe("M");
    expect(variantLabel({ color: "", size: "" })).toBe("");
  });
});

describe("preorderStageTone", () => {
  it("colours a pre-order by its own stage, not by a stock status", () => {
    expect(preorderStageTone("completed")).toBe("done");
    expect(preorderStageTone("cancelled")).toBe("bad");
    expect(preorderStageTone("received_in_bd_airport")).toBe("progress");
  });
});
