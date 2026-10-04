import { describe, expect, it } from "vitest";
import { loginHref, safeNextPath, splitFullName } from "../redirect";

describe("safeNextPath", () => {
  it("keeps a path on this site", () => {
    expect(safeNextPath("/product/soft-hobo-shoulder-bag")).toBe("/product/soft-hobo-shoulder-bag");
    expect(safeNextPath("/shop?category=bags")).toBe("/shop?category=bags");
  });

  it("falls back when there is no next path", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(undefined, "/shop")).toBe("/shop");
  });

  it("refuses anything that could leave the site", () => {
    expect(safeNextPath("https://evil.example/")).toBe("/");
    expect(safeNextPath("//evil.example/")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });
});

describe("loginHref", () => {
  it("round-trips the return path through safeNextPath", () => {
    const href = loginHref("/product/a?x=1&y=2");
    const next = new URL(href, "http://site.test").searchParams.get("next");
    expect(safeNextPath(next)).toBe("/product/a?x=1&y=2");
  });
});

describe("splitFullName", () => {
  it("puts the first word in first_name and the rest in last_name", () => {
    expect(splitFullName("  Jane   Mary Doe ")).toEqual({ first_name: "Jane", last_name: "Mary Doe" });
    expect(splitFullName("Jane")).toEqual({ first_name: "Jane", last_name: "" });
  });
});
