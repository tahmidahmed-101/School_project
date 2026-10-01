import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import {
  BEST_SELLER_SIZE,
  TRENDING_SIZE,
  bestSellers,
  categoryShelf,
  homeProducts,
  shelfSize,
  trending,
} from "../domain/home-products";

const makeCatalogue = (length: number) =>
  Array.from({ length }, (_, i) =>
    makeProduct({
      id: `p${i}`,
      category: (["shirts", "denim", "footwear"] as const)[i % 3],
      featured: i % 7 === 0,
      isPreOrder: i % 11 === 0,
    }),
  );
const catalogue = makeCatalogue(60);

const ids = (list: { id: string }[]) => list.map((p) => p.id);
const stock = (list: typeof catalogue) => list.filter((p) => !p.isPreOrder);

describe("shelfSize", () => {
  it("fills whole rows of five up to the cap", () => {
    expect(shelfSize(25, 10)).toBe(10);
    expect(shelfSize(9, 10)).toBe(5);
    expect(shelfSize(5, 10)).toBe(5);
    expect(shelfSize(3, 10)).toBe(3);
  });
});

describe("homeProducts", () => {
  const subset = homeProducts(catalogue);

  it("drops pre-order products and anything no shelf shows", () => {
    expect(subset.every((p) => !p.isPreOrder)).toBe(true);
    expect(subset.length).toBeLessThan(stock(catalogue).length);
  });

  it("yields the same trending, best-seller and category shelves as the full catalogue", () => {
    expect(ids(trending(stock(subset)))).toEqual(ids(trending(stock(catalogue))));
    expect(ids(bestSellers(subset))).toEqual(ids(bestSellers(stock(catalogue))));
    for (const category of ["shirts", "denim", "footwear"]) {
      expect(ids(categoryShelf(subset, category))).toEqual(ids(categoryShelf(stock(catalogue), category)));
    }
  });
});

describe("bestSellers", () => {
  it("never repeats a trending product and fills two rows", () => {
    const list = stock(catalogue);
    const shown = new Set(ids(trending(list)));
    const picks = bestSellers(list);
    expect(trending(list)).toHaveLength(TRENDING_SIZE);
    expect(picks).toHaveLength(BEST_SELLER_SIZE);
    expect(picks.some((p) => shown.has(p.id))).toBe(false);
  });

  it("is empty when too few products are left after trending", () => {
    expect(bestSellers(stock(makeCatalogue(14)))).toEqual([]);
  });
});
