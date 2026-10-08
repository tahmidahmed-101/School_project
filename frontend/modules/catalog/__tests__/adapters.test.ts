import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ publicEnv: { apiUrl: "https://api.kullmart.com/api/v1/public" } }));

const { normalizeImageUrl, toCategoryInfo } = await import("../data/adapters");

describe("normalizeImageUrl", () => {
  it("puts media paths on the API origin", () => {
    expect(normalizeImageUrl(" /media/uploads/a.jpg ")).toBe("https://api.kullmart.com/media/uploads/a.jpg");
  });

  it("keeps absolute URLs and static paths as they are", () => {
    expect(normalizeImageUrl("https://api.kullmart.com/media/b.jpg")).toBe("https://api.kullmart.com/media/b.jpg");
    expect(normalizeImageUrl("https://picsum.photos/seed/x/800")).toBe("https://picsum.photos/seed/x/800");
    expect(normalizeImageUrl("/catalog/c.jpg")).toBe("/catalog/c.jpg");
  });

  it("returns empty for blank input", () => {
    expect(normalizeImageUrl("  ")).toBe("");
  });
});

describe("toCategoryInfo", () => {
  const category = { id: "c1", name: "Shirts", slug: "shirts", parent_id: null, category_type: "stock" as const };

  it("takes the count and picture from the API when it sends them", () => {
    const info = toCategoryInfo({ ...category, product_count: 7, image: "/media/shirt.jpg" });

    expect(info.itemCount).toBe(7);
    expect(info.image).toBe("https://api.kullmart.com/media/shirt.jpg");
  });

  it("shows the placeholder for a counted category without a picture", () => {
    const info = toCategoryInfo({ ...category, product_count: 0, image: null });

    expect(info.itemCount).toBe(0);
    expect(info.image).toBe("brand/logo-mark.png");
  });

  it("counts nothing when an older API sends no count and no products are given", () => {
    expect(toCategoryInfo(category).itemCount).toBe(0);
  });
});
