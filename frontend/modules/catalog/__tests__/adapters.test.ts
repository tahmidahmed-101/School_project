import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ publicEnv: { apiUrl: "https://api.kullmart.com/api/v1/public" } }));

const { normalizeImageUrl } = await import("../data/adapters");

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
