import { describe, expect, it } from "vitest";
import { BRAND_INFO } from "@/lib/brand";
import { absoluteUrl } from "@/lib/site-url";
import type { CategoryInfo } from "@/lib/types";
import { makeProduct } from "@/tests/fixtures";
import { buildLlmsTxt } from "../llms";

const category = (slug: string): CategoryInfo => ({
  id: slug,
  slug,
  name: { en: slug, bn: "" },
  description: { en: "", bn: "" },
  image: "",
  itemCount: 0,
});

describe("buildLlmsTxt", () => {
  const text = buildLlmsTxt(
    {
      products: [makeProduct({ id: "1" }), makeProduct({ id: "2" })],
      categories: [category("bags"), category("gadgets")],
    } as never,
    BRAND_INFO,
  );

  it("links every category into the shop", () => {
    expect(text).toContain(`- bags: ${absoluteUrl("/shop?category=bags")}`);
    expect(text).toContain(`- gadgets: ${absoluteUrl("/shop?category=gadgets")}`);
  });

  it("counts the products and categories", () => {
    expect(text).toContain("- Shop: 2 in-stock products across 2 categories");
  });
});
