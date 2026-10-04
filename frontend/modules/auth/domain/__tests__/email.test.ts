import { describe, expect, it } from "vitest";
import { suggestEmailCorrection } from "../email";

describe("suggestEmailCorrection", () => {
  it("catches the slips that locked real customers out", () => {
    expect(suggestEmailCorrection("mdpranto278@gamil.com")).toBe("mdpranto278@gmail.com");
    expect(suggestEmailCorrection("test@gmai.com")).toBe("test@gmail.com");
  });

  it("catches other near misses of common providers", () => {
    expect(suggestEmailCorrection("a@gmial.com")).toBe("a@gmail.com");
    expect(suggestEmailCorrection("a@gmail.con")).toBe("a@gmail.com");
    expect(suggestEmailCorrection("a@GMAIL.CO")).toBe("a@gmail.com");
    expect(suggestEmailCorrection("a@yaho.com")).toBe("a@yahoo.com");
    expect(suggestEmailCorrection("a@hotmial.com")).toBe("a@hotmail.com");
    expect(suggestEmailCorrection("a@outlok.com")).toBe("a@outlook.com");
  });

  it("leaves correct and unrelated addresses alone", () => {
    expect(suggestEmailCorrection("a@gmail.com")).toBeNull();
    expect(suggestEmailCorrection("a@Gmail.com")).toBeNull();
    expect(suggestEmailCorrection("a@kullmart.com")).toBeNull();
    expect(suggestEmailCorrection("a@example.com")).toBeNull();
    expect(suggestEmailCorrection("staff@company.com.bd")).toBeNull();
  });

  it("ignores things that are not an address yet", () => {
    expect(suggestEmailCorrection("")).toBeNull();
    expect(suggestEmailCorrection("no-at-sign")).toBeNull();
    expect(suggestEmailCorrection("@gmail.com")).toBeNull();
    expect(suggestEmailCorrection("a@")).toBeNull();
  });
});
