import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import { BEST_SELLER_SIZE, CATEGORY_SHELF_SIZE, bestSellers, homeProducts } from "../domain/home-products";

const catalogue = Array.from({ length: 60 }, (_, i) =>
  makeProduct({
    id: `p${i}`,
    category: (["shirts", "denim", "footwear"] as const)[i % 3],
    featured: i % 7 === 0,
    isPreOrder: i % 11 === 0,
  }),
);

const ids = (list: { id: string }[]) => list.map((p) => p.id);
const stock = (list: typeof catalogue) => list.filter((p) => !p.isPreOrder);

describe("homeProducts", () => {
  const subset = homeProducts(catalogue);

  it("drops pre-order products and anything no shelf shows", () => {
    expect(subset.every((p) => !p.isPreOrder)).toBe(true);
    expect(subset.length).toBeLessThan(stock(catalogue).length);
  });

  it("yields the same trending, best-seller and category shelves as the full catalogue", () => {
    expect(ids(stock(subset).slice(0, 12))).toEqual(ids(stock(catalogue).slice(0, 12)));
    expect(ids(bestSellers(subset))).toEqual(ids(bestSellers(stock(catalogue))));
    for (const category of ["shirts", "denim", "footwear"]) {
      const shelf = (list: typeof catalogue) =>
        ids(list.filter((p) => p.category === category).slice(0, CATEGORY_SHELF_SIZE));
      expect(shelf(subset)).toEqual(shelf(stock(catalogue)));
    }
  });

  it("caps best sellers", () => {
    expect(bestSellers(stock(catalogue))).toHaveLength(BEST_SELLER_SIZE);
  });
});
