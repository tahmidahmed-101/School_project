import { describe, expect, it } from "vitest";
import { avatarInitial, avatarSrc, firstName } from "../avatar";

describe("avatarInitial", () => {
  it("uses the name, then the email", () => {
    expect(avatarInitial({ name: "jane doe", email: "x@example.com" })).toBe("J");
    expect(avatarInitial({ name: "  ", email: "pranto@example.com" })).toBe("P");
    expect(avatarInitial({ name: "", email: "" })).toBe("?");
  });

  it("keeps a Bangla first letter whole", () => {
    expect(avatarInitial({ name: "রহিম", email: "" })).toBe("র");
  });
});

describe("avatarSrc", () => {
  it("has no picture for an empty value", () => {
    expect(avatarSrc("")).toBeNull();
    expect(avatarSrc(undefined)).toBeNull();
  });

  it("serves uploaded media through the same-origin proxy", () => {
    expect(avatarSrc("/media/avatars/a.jpg")).toBe("/media/avatars/a.jpg");
    expect(avatarSrc("https://api.kullmart.com/media/avatars/a.jpg")).toBe("/media/avatars/a.jpg");
  });

  it("drops pictures the CSP would block", () => {
    expect(avatarSrc("https://elsewhere.example/pic.jpg")).toBeNull();
    expect(avatarSrc("//elsewhere.example/pic.jpg")).toBeNull();
    expect(avatarSrc("not a url")).toBeNull();
  });
});

describe("firstName", () => {
  it("takes the first word of the name", () => {
    expect(firstName({ name: " Jane Mary Doe" })).toBe("Jane");
    expect(firstName({ name: "" })).toBe("");
  });
});
