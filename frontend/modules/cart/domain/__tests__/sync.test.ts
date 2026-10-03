import { describe, expect, it } from "vitest";
import type { CartItem } from "@/lib/types";
import { makeProduct } from "@/tests/fixtures";
import { planCartSync, toCartTargets } from "../sync";

describe("toCartTargets", () => {
  it("sends only the SKU and quantity, one entry per SKU", () => {
    const items: CartItem[] = [
      { product: makeProduct({ price: 999 }), quantity: 2, variantId: "v-1" },
      { product: makeProduct({ id: "p-2" }), quantity: 1, variantId: "v-2" },
      { product: makeProduct({ price: 999 }), quantity: 3, variantId: "v-1" },
    ];
    expect(toCartTargets(items)).toEqual([
      { variantId: "v-1", quantity: 5 },
      { variantId: "v-2", quantity: 1 },
    ]);
  });
});

describe("planCartSync", () => {
  it("does nothing when the server cart already matches", () => {
    expect(planCartSync([{ variantId: "v-1", quantity: 2 }], [{ id: "l-1", variantId: "v-1", quantity: 2 }])).toEqual(
      [],
    );
  });

  it("adds, updates and removes to reach the target", () => {
    const ops = planCartSync(
      [
        { variantId: "v-1", quantity: 3 },
        { variantId: "v-3", quantity: 1 },
      ],
      [
        { id: "l-1", variantId: "v-1", quantity: 2 },
        { id: "l-2", variantId: "v-2", quantity: 1 },
      ],
    );
    expect(ops).toEqual([
      { type: "update", lineId: "l-1", quantity: 3 },
      { type: "remove", lineId: "l-2" },
      { type: "add", variantId: "v-3", quantity: 1 },
    ]);
  });

  it("empties the server cart for an empty browser cart", () => {
    expect(planCartSync([], [{ id: "l-1", variantId: "v-1", quantity: 2 }])).toEqual([
      { type: "remove", lineId: "l-1" },
    ]);
  });

  it("drops a duplicate server line for the same SKU", () => {
    const ops = planCartSync(
      [{ variantId: "v-1", quantity: 2 }],
      [
        { id: "l-1", variantId: "v-1", quantity: 2 },
        { id: "l-2", variantId: "v-1", quantity: 4 },
      ],
    );
    expect(ops).toEqual([{ type: "remove", lineId: "l-2" }]);
  });
});
