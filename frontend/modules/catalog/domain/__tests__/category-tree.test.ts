import { describe, expect, it } from "vitest";
import type { CategoryInfo } from "@/lib/types";
import { categoryFamily, categoryGroups, categoryTree } from "../category-tree";

const category = (id: string, parentId?: string): CategoryInfo => ({
  id,
  slug: id,
  name: { en: id, bn: id },
  description: { en: "", bn: "" },
  image: "",
  itemCount: 0,
  ...(parentId && { parentId }),
});

const shape = (categories: CategoryInfo[]) =>
  categoryTree(categories).map(({ category, depth, parent }) => [category.id, depth, parent?.id]);

describe("categoryTree", () => {
  it("lists each subcategory right after its main category", () => {
    const list = [category("bags"), category("polos", "shirts"), category("shirts"), category("tees", "shirts")];

    expect(shape(list)).toEqual([
      ["bags", 0, undefined],
      ["shirts", 0, undefined],
      ["polos", 1, "shirts"],
      ["tees", 1, "shirts"],
    ]);
  });

  it("goes deeper than one level", () => {
    const list = [category("slim", "polos"), category("polos", "shirts"), category("shirts")];

    expect(shape(list)).toEqual([
      ["shirts", 0, undefined],
      ["polos", 1, "shirts"],
      ["slim", 2, "polos"],
    ]);
  });

  it("shows a subcategory as a main one when its parent is not in the list", () => {
    expect(shape([category("polos", "shirts"), category("bags")])).toEqual([
      ["polos", 0, undefined],
      ["bags", 0, undefined],
    ]);
  });

  it("keeps every category when parents point at each other", () => {
    expect(shape([category("a", "b"), category("b", "a")]).map(([id]) => id)).toEqual(["a", "b"]);
  });
});

describe("categoryGroups", () => {
  it("puts subcategories under their main category and adds up the products", () => {
    const list = [
      { ...category("shirts"), itemCount: 2 },
      { ...category("polos", "shirts"), itemCount: 3 },
      { ...category("slim", "polos"), itemCount: 1 },
      { ...category("bags"), itemCount: 4 },
    ];

    expect(
      categoryGroups(list).map(({ main, subs, itemCount }) => [main.id, subs.map((s) => s.category.id), itemCount]),
    ).toEqual([
      ["shirts", ["polos", "slim"], 6],
      ["bags", [], 4],
    ]);
  });
});

describe("categoryFamily", () => {
  const list = [category("shirts"), category("polos", "shirts"), category("slim", "polos"), category("bags")];

  it("covers a category and everything under it", () => {
    expect([...categoryFamily(list, "Shirts")]).toEqual(["shirts", "polos", "slim"]);
    expect([...categoryFamily(list, "polos")]).toEqual(["polos", "slim"]);
    expect([...categoryFamily(list, "bags")]).toEqual(["bags"]);
  });

  it("still matches a category that is not in the list", () => {
    expect([...categoryFamily([], "bags")]).toEqual(["bags"]);
  });
});
