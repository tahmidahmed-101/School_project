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

describe("trending", () => {
  const plain = (id: string) => makeProduct({ id });
  const flagged = (id: string) => makeProduct({ id, trending: true });
  const many = (count: number, make: (id: string) => ReturnType<typeof makeProduct>, prefix: string) =>
    Array.from({ length: count }, (_, i) => make(prefix + i));

  it("puts flagged products first, in catalogue order, then fills with the rest", () => {
    const list = [plain("a"), flagged("b"), plain("c"), flagged("d"), ...many(12, plain, "x")];
    const picks = ids(trending(list));
    expect(picks).toHaveLength(TRENDING_SIZE);
    expect(picks.slice(0, 4)).toEqual(["b", "d", "a", "c"]);
  });

  it("shows only flagged products once there are enough of them", () => {
    const list = [plain("a"), ...many(TRENDING_SIZE + 2, flagged, "t")];
    expect(ids(trending(list))).toEqual(ids(list.slice(1, TRENDING_SIZE + 1)));
  });

  it("keeps catalogue order when nothing is flagged", () => {
    const list = stock(catalogue);
    expect(ids(trending(list))).toEqual(ids(list.slice(0, TRENDING_SIZE)));
  });

  it("stays out of the best-seller shelf and survives the home subset", () => {
    const list = stock(catalogue).map((p, i) => (i % 9 === 4 ? { ...p, trending: true } : p));
    const shown = new Set(ids(trending(list)));
    expect(bestSellers(list).some((p) => shown.has(p.id))).toBe(false);
    const subset = homeProducts(list);
    expect(ids(trending(subset))).toEqual(ids(trending(list)));
    expect(ids(bestSellers(subset))).toEqual(ids(bestSellers(list)));
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
