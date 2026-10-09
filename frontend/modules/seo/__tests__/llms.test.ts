import { describe, expect, it } from "vitest";
import { BRAND_INFO } from "@/lib/brand";
import { absoluteUrl } from "@/lib/site-url";
import type { CategoryInfo } from "@/lib/types";
import { makeProduct } from "@/tests/fixtures";
import { buildLlmsTxt } from "../llms";

const category = (slug: string, type: CategoryInfo["type"]): CategoryInfo => ({
  id: slug,
  slug,
  name: { en: slug, bn: "" },
  description: { en: "", bn: "" },
  image: "",
  itemCount: 0,
  type,
});

describe("buildLlmsTxt", () => {
  const text = buildLlmsTxt(
    {
      products: [
        makeProduct({ id: "1" }),
        makeProduct({ id: "2" }),
        makeProduct({ id: "3", kind: "preorder", isPreOrder: true }),
      ],
      categories: [category("bags", "stock"), category("gadgets", "preorder")],
    } as never,
    BRAND_INFO,
  );

  it("links a pre-order category into the pre-order shop, under its own heading", () => {
    const [stockPart, preorderPart] = text.split("## Pre-order categories");
    expect(stockPart).toContain(`- bags: ${absoluteUrl("/shop?category=bags")}`);
    expect(stockPart).not.toContain("- gadgets:");
    expect(preorderPart).toContain(`- gadgets: ${absoluteUrl("/shop?type=preorder&category=gadgets")}`);
  });

  it("counts each shop on its own, with no figure across both", () => {
    expect(text).toContain("- Shop: 2 in-stock products across 1 categories");
    expect(text).toContain("- Pre-order: 1 pre-order products across 1 categories");
    expect(text).not.toContain("3 products");
  });
});
